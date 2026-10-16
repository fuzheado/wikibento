#!/usr/bin/env python3
"""Candidate-generation + validation pipeline for Commons image notes -> Wikidata items.

Read-only. For each note it produces ranked candidates using a 4-stage ladder:
  1. explicit :wikidata:Q... links
  2. wiki links resolved on their own wiki via prop=pageprops (wikibase_item)
  3. name normalisation -> Wikipedia title search (content-language first) -> QID
  4. Wikidata entity search on the cleaned name, then validation:
       P31=human, birth/death year plausibility against the artwork's date,
       and context boosts from the linked artwork item's depicts / the file's own depicts.

Usage:
  python3 matcher.py --files <n> [--out candidates.json]     # top-N notes files from files.jsonl
  python3 matcher.py --titles <json list> [--out ...]        # explicit titles
"""
import json, os, re, sys, time, urllib.parse, urllib.request

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) WikiButler-ImageNoteAudit/1.0"
OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'
CACHE = os.path.join(OUTDIR, "api_cache.json")

# Wikimedia-internal item types that must never become a "depicts" value
WIKIMEDIA_INTERNAL = {"Q4167836",   # Wikimedia category
                      "Q4167410",   # Wikimedia disambiguation page
                      "Q11266439",  # Wikimedia template
                      "Q13406463",  # Wikimedia list article
                      "Q17362920",  # duplicated Wikimedia page
                      "Q14204246",  # Wikimedia project page
                      "Q18340514",  # article about an event
                      }
_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
_saves = [0]


def _cache_save(force=False):
    _saves[0] += 1
    if force or _saves[0] % 25 == 0:
        json.dump(_cache, open(CACHE, "w"))


def api(host, params, tries=5):
    key = host + "|" + urllib.parse.urlencode(sorted(params.items()))
    if key in _cache:
        return _cache[key]
    params = dict(params)
    params.setdefault("format", "json")
    if "wikidata.org" not in host:
        params.setdefault("maxlag", "5")
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    delay = 1.5
    for attempt in range(tries):
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=90))
            if isinstance(d, dict) and "error" in d:
                if attempt < tries - 1:
                    time.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue
                raise RuntimeError(d["error"])
            _cache[key] = d
            _cache_save()
            time.sleep(0.4)
            return d
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 30)
    raise RuntimeError("unreachable")


# ---------------------------------------------------------------- text handling
INNER_TPL = re.compile(r"\{\{([^{}]*)\}\}")
LANG_PIPE = re.compile(r"^(?:langswitch\s*\|)?([a-z]{2,3}(?:-[a-z]+)?)\s*\|(?:1=)?(.+)$", re.I | re.S)
LANG_EQ = re.compile(r"^(?:langswitch\s*\|)?([a-z]{2,3}(?:-[a-z]+)?)\s*=\s*(.+)$", re.I | re.S)
MULTI_EQ = re.compile(r"([a-z]{2,3}(?:-[a-z]+)?)\s*=\s*([^|]+)")
TMPL_RE = re.compile(r"\{\{[^{}]*\}\}")


KEEP_PAYLOAD = {"nowrap", "nbsp", "center", "small", "big", "larger", "smaller", "lang", "ill", "w",
                "plainlist", "abbr", "tooltip", "font", "span", "ubl", "clear", "nowrap begin",
                "langswitch", "native name", "lang-en", "lang-fr", "lang-de", "lang-pt", "lang-ru",
                "lang-it", "lang-es", "lang-nl", "lang-pl", "lang-zh", "lang-ja", "convert"}


def _tmpl_repl(m):
    """Keep the human-readable payload of language/formatting templates, drop the rest.

    Notes are written in many shapes — {{en|Time}}, {{en|1=Time}}, {{Langswitch|en=Time}},
    {{nowrap|'' A British Monument ''}} — and a naive strip blanks the note entirely, which
    silently breaks both matching and the synchronicity cross-check ("no textual evidence").
    """
    body = m.group(1).strip()
    low = body.lower()
    if low.startswith("langswitch"):
        pairs = {k.lower(): v.strip() for k, v in MULTI_EQ.findall(body)}
        return pairs.get("en") or (next(iter(pairs.values())) if pairs else " ")
    name = re.split(r"[|:]", body, 1)[0].strip().lower()
    if name in KEEP_PAYLOAD or re.fullmatch(r"[a-z]{2,3}(?:-[a-z]+)?", name):
        payload = body.split("|", 1)[1] if "|" in body else ""
        payload = re.sub(r"^\s*1\s*=", "", payload)
        if payload and not payload.strip().lower().startswith(("http", "file:", "image:", "category:")):
            return payload
    if low.startswith("ill|"):                       # {{ill|Label|lang|Title}}
        return body.split("|")[1]
    mm = LANG_PIPE.match(body)
    if mm and not mm.group(2).strip().lower().startswith(("http", "file:", "image:", "category:")):
        return mm.group(2)
    mm = LANG_EQ.match(body)
    if mm and not mm.group(2).strip().lower().startswith(("http", "file:", "image:", "category:")):
        return mm.group(2)
    return " "


def expand_templates(text, depth=4):
    for _ in range(depth):
        new = INNER_TPL.sub(_tmpl_repl, text)
        if new == text:
            break
        text = new
    return TMPL_RE.sub(" ", text)


HONORIFIC = r"^(?:Dom|Dona|Don|Doña|Sir|Lady|Lord|Rei-de-armas|Rei de Armas|King-of-Arms)\s+"


def note_variants(text):
    """Return (plain_text, [(lang, text)]) — language-template payloads kept.

    If the note is nothing but templates/markup, fall back to the display labels of any
    links in it, so the note is never silently blank.
    """
    variants = []
    for m in re.finditer(r"\{\{\s*([a-z]{2,3}(?:-[a-z]+)?)\s*\|(?:1=)?([^{}]*?)\}\}", text, re.I):
        v = re.sub(r"<[^>]+>", "", m.group(2)).strip(" []|")
        if v and not v.lower().startswith(("http", "file:", "image:", "category:")):
            variants.append((m.group(1).lower(), v))
    for m in re.finditer(r"\{\{\s*([a-z]{2,3}(?:-[a-z]+)?)\s*=\s*([^{}]*?)\}\}", text, re.I):
        v = re.sub(r"<[^>]+>", "", m.group(2)).strip(" []|")
        if v:
            variants.append((m.group(1).lower(), v))
    plain = expand_templates(text)
    plain = re.sub(r"<[^>]+>", " ", plain)
    plain = re.sub(r"\[\[([^\]\|]+)\|([^\]]+)\]\]", r"\2", plain)   # piped link -> label
    plain = re.sub(r"\[\[([^\]]+)\]\]", r"\1", plain)
    plain = re.sub(r"\[https?://\S+\s+([^\]]+)\]", r"\1", plain)
    plain = re.sub(r"'{2,}", "", plain)
    plain = re.sub(r"\s+", " ", plain).strip(" .,;:·-")
    if len(plain) < 2:
        labels = []
        for m in re.finditer(r"\[\[([^\]\|]+)\|([^\]]+)\]\]", text):
            labels.append(m.group(2).strip())
        for m in re.finditer(r"\[\[([^\]]+)\]\]", text):
            labels.append(m.group(1).strip())
        plain = " ".join(dict.fromkeys(labels)).strip()
    return plain, variants
def name_spans(plain, variants):
    """Candidate name strings: the head clause of each language variant."""
    out = []
    for txt in [plain] + [v for _, v in variants]:
        if not txt:
            continue
        head = txt.split("(")[0]
        head = re.split(r",", head)[0]
        head = re.sub(HONORIFIC, "", head.strip(), flags=re.I)
        head = re.sub(r"^(?:the|a|an)\s+", "", head, flags=re.I).strip(" .,;:")
        head = re.sub(r"\s+(?:of|de|do|da)\s+(?:Bahia|Brazil|Lajes|Uruguay|the)\b.*$", "", head, flags=re.I).strip()
        if 2 < len(head) <= 60 and not re.search(r"\b(no|not|please|see|this|photo|image|why|what)\b", head, re.I):
            out.append(head)
    # also the whole cleaned clause when it looks like a name (2-4 capitalised words)
    for txt in [plain] + [v for _, v in variants]:
        words = txt.split()
        if 1 < len(words) <= 5 and sum(1 for w in words if w[:1].isupper()) >= len(words) - 1:
            out.append(txt.strip(" .,;:"))
    seen, uniq = set(), []
    for x in out:
        k = x.lower()
        if k not in seen:
            seen.add(k)
            uniq.append(x)
    return uniq[:4]


# ---------------------------------------------------------------- resolution
def parse_link(target):
    t = target.strip()
    low = t.lower()
    if low.startswith(("user:", "user talk:", "file:", "image:")) or low.startswith("special:"):
        return None
    if low.startswith((":wikidata:", "wikidata:", "d:")):
        q = t.split(":")[-1].strip()
        return ("QID", q.upper()) if re.fullmatch(r"[Qq]\d+", q) else None
    pre = re.match(r"^:?([a-z]{2,3}(?:-[a-z]+)?|commons|w):(.+)$", t)
    if pre:
        lang, title = pre.group(1), pre.group(2)
        lang = "en" if lang == "w" else lang
        return ("WIKI", ("commons" if lang == "commons" else lang, title))
    if low.startswith(("category:", ":category:")):
        return ("CAT", t.split(":", 1)[1])
    return ("WIKI", ("commons", t.lstrip(":")))


def pageprops_qid(wiki, title):
    host = "commons.wikimedia.org" if wiki == "commons" else f"{wiki}.wikipedia.org"
    try:
        d = api(host, {"action": "query", "prop": "pageprops", "ppprop": "wikibase_item",
                       "titles": title, "redirects": "1"})
    except Exception:
        return None
    pages = d.get("query", {}).get("pages", {})
    for p in (pages.values() if isinstance(pages, dict) else pages):
        q = p.get("pageprops", {}).get("wikibase_item")
        if q:
            return q
    return None


def p373_qid(cat):
    """Resolve a [[:Category:X]] note link.

    Commons categories are sitelinked from Wikidata items, so pageprops on the category
    page is the reliable route; a Wikimedia-category item is then mapped to its topic via
    P301 (category's main topic).
    """
    qid = pageprops_qid("commons", f"Category:{cat}")
    if not qid:
        try:
            d = api("www.wikidata.org", {"action": "query", "list": "search",
                    "srsearch": f'haswbstatement:P373="{cat}"', "srnamespace": "0", "srlimit": "1"})
            hits = d.get("query", {}).get("search", [])
            qid = hits[0]["title"] if hits else None
        except Exception:
            return None
    if not qid:
        return None
    facts = entity_facts([qid])
    f = facts.get(qid, {})
    if WIKIMEDIA_INTERNAL & set(f.get("p31") or []):
        try:
            d = api("www.wikidata.org", {"action": "wbgetentities", "ids": qid, "props": "claims"})
            cl = (d.get("entities", {}).get(qid, {}) or {}).get("claims", {})
            for c in cl.get("P301", []):
                dv = c.get("mainsnak", {}).get("datavalue")
                if dv:
                    return dv["value"]["id"]
        except Exception:
            pass
        return None      # a category item with no topic is not a usable depicts value
    return qid


def wiki_search_qids(lang, text, limit=3):
    """Search a content wiki (articles only), then map the top titles to QIDs."""
    host = "commons.wikimedia.org" if lang == "commons" else f"{lang}.wikipedia.org"
    try:
        d = api(host, {"action": "query", "list": "search", "srsearch": text, "srlimit": str(limit),
                       "srnamespace": "0" if lang != "commons" else "6|14"})
    except Exception:
        return []
    out = []
    for h in d.get("query", {}).get("search", []):
        q = pageprops_qid(lang, h["title"])
        if q:
            out.append((q, h["title"], "wiki_search:" + lang))
    return out


SCRIPT_WIKI = [("CYRILLIC", "ru"), ("GREEK", "el"), ("ARABIC", "ar"), ("HEBREW", "he"),
               ("HIRAGANA", "ja"), ("KATAKANA", "ja"), ("CJK", "zh"), ("HANGUL", "ko"),
               ("DEVANAGARI", "hi")]


def detect_wiki(text):
    """Pick the search wiki from the writing system of the note text (notes are multilingual)."""
    import unicodedata
    counts = {}
    for ch in text:
        if not ch.isalpha():
            continue
        try:
            name = unicodedata.name(ch)
        except ValueError:
            continue
        for script, wiki in SCRIPT_WIKI:
            if name.startswith(script) or f" {script} " in name:
                counts[wiki] = counts.get(wiki, 0) + 1
    if counts:
        return max(counts, key=counts.get)
    return None   # Latin script -> caller uses pt/en


def wd_search_qids(text, limit=4):
    out = []
    for lang in ("en", "pt"):
        try:
            d = api("www.wikidata.org", {"action": "wbsearchentities", "search": text, "language": lang,
                    "uselang": "en", "limit": str(limit), "type": "item"})
        except Exception:
            continue
        for h in d.get("search", []):
            out.append((h["id"], h.get("label") or "", f"wd_search:{lang}"))
    return out


def entity_facts(qids):
    """Batch-fetch P31/P569/P570/P106/label/description for candidate items."""
    facts = {}
    qids = list(dict.fromkeys(qids))
    for i in range(0, len(qids), 25):
        try:
            d = api("www.wikidata.org", {"action": "wbgetentities", "ids": "|".join(qids[i:i + 25]),
                    "props": "claims|labels|descriptions", "languages": "en|pt|mul"})
        except Exception:
            continue
        for q, e in (d.get("entities") or {}).items():
            if "missing" in e:
                continue
            cl = e.get("claims") or {}

            def val(p, dt="id"):
                vs = []
                for c in cl.get(p, []):
                    dv = c.get("mainsnak", {}).get("datavalue")
                    if dv:
                        vs.append(dv["value"]["id"] if dt == "id" else dv["value"]["time"][1:5])
                return vs
            facts[q] = {"label": (e.get("labels", {}).get("en") or e.get("labels", {}).get("mul")
                                  or e.get("labels", {}).get("pt") or {}).get("value"),
                        "desc": ((e.get("descriptions", {}).get("en") or e.get("descriptions", {}).get("pt")
                                  or {}).get("value") or "")[:90],
                        "p31": val("P31"), "birth": val("P569", "time"), "death": val("P570", "time"),
                        "occupation": val("P106")}
    return facts


# ---------------------------------------------------------------- scoring
def artwork_year(rec):
    """Best-effort year of the artwork (template date params, else the artwork item's P571)."""
    for p in ("Artwork.date", "Photograph.date", "Map.date", "Information.date"):
        s = (rec.get("template_params") or {}).get(p)
        if s:
            m = re.search(r"(1[5-9]\d\d|20\d\d)", s)
            if m:
                return int(m.group(1))
    for q in (rec.get("artwork_items") or {}):
        try:
            d = api("www.wikidata.org", {"action": "wbgetentities", "ids": q, "props": "claims"})
            cl = (d.get("entities", {}).get(q, {}) or {}).get("claims", {})
            for c in cl.get("P571", []):
                dv = c.get("mainsnak", {}).get("datavalue")
                if dv:
                    m = re.search(r"([+-])(\d{4})", dv["value"]["time"])
                    if m:
                        y = int(m.group(2))
                        return -y if m.group(1) == "-" else y
        except Exception:
            continue
    return None


def score_candidate(qid, source, facts, ctx):
    f = facts.get(qid, {})
    s = {"wikilink": 0.85, "qid_link": 0.97,
         "wiki_search:en": 0.62, "wiki_search:pt": 0.68,
         "wd_search:en": 0.55, "wd_search:pt": 0.58}.get(source, 0.5)
    if source.startswith("wiki_search:"):
        s = 0.68 if source.endswith(":pt") else 0.62
    reasons = [source]
    p31 = f.get("p31") or []
    if WIKIMEDIA_INTERNAL & set(p31):
        s -= 0.5
        reasons.append("Wikimedia-internal item (category/list/etc.)")
    if qid in ctx.get("artwork_items", []):
        s -= 0.25
        reasons.append("is the artwork's own item")
    if qid in ctx.get("artwork_depicts", []):
        s = max(s, 0.95)
        reasons.append("in artwork item's depicts")
    if qid in ctx.get("file_depicts", []):
        s = min(0.99, s + 0.15)
        reasons.append("already in file SDC")
    if "Q5" in p31:
        reasons.append("human")
    elif p31:
        reasons.append("not-human(P31=" + ",".join(p31[:2]) + ")")
        s -= 0.15
    yr = ctx.get("year")
    b = f.get("birth") or []
    d_ = f.get("death") or []
    if yr and b:
        try:
            by = int(b[0])
            if by > yr + 3:
                s -= 0.45
                reasons.append(f"born {by} after artwork ({yr})")
            elif by <= yr:
                s += 0.06
                reasons.append(f"born {by}")
        except Exception:
            pass
    if yr and d_:
        try:
            if int(d_[0]) < yr - 60:
                s -= 0.2
                reasons.append(f"died {d_[0]} long before")
        except Exception:
            pass
    return max(0.0, min(0.99, s)), reasons, f


def candidates_for_note(note, rec, ctx):
    """Run the ladder for one note. Returns (candidates, note_kind_guesses)."""
    cands = {}   # qid -> (score, reasons, source)
    notes_kind = []
    for link in note.get("links", []):
        p = parse_link(link["target"])
        if not p:
            continue
        if p[0] == "QID":
            qid = p[1]
            s, r, f = score_candidate(qid, "qid_link", entity_facts([qid]), ctx)
            cands[qid] = (s, r, f)
        elif p[0] == "WIKI":
            qid = pageprops_qid(*p[1])
            if qid and qid not in cands:
                s, r, f = score_candidate(qid, "wikilink", entity_facts([qid]), ctx)
                cands[qid] = (s, r + [f"resolved from link ({p[1][0]})"], f)
        elif p[0] == "CAT":
            qid = p373_qid(p[1])
            if qid and qid not in cands:
                s, r, f = score_candidate(qid, "wiki_search:en", entity_facts([qid]), ctx)
                cands[qid] = (s, r + ["resolved from category link"], f)
    plain, variants = note_variants(note["text"])
    if len(plain) < 3:
        notes_kind.append("markup-only")
    if not cands and plain:
        for span in name_spans(plain, variants):
            raw = []
            # notes are multilingual: search the wiki matching the note's writing system first
            wiki = detect_wiki(span) or detect_wiki(plain)
            langs = [wiki] if wiki else []
            langs += [l for l in ("pt", "en") if l not in langs]
            for lang in langs[:2]:
                raw += wiki_search_qids(lang, span)
            if not wiki:                      # Latin script: also try Wikidata labels
                raw += wd_search_qids(span)
            if raw:
                facts = entity_facts([q for q, _, _ in raw])
                for qid, label, src in raw:
                    if qid in cands:
                        continue
                    s, r, f = score_candidate(qid, src, facts, ctx)
                    cands[qid] = (s, r + [f"name={span!r}"], f)
    ranked = sorted(cands.items(), key=lambda kv: -kv[1][0])
    return ranked, plain, variants, notes_kind


def build_context(rec):
    return {"file_depicts": [c["qid"] for c in rec.get("sdc", {}).get("p180", [])],
            "artwork_items": sorted((rec.get("artwork_items") or {}).keys()),
            "artwork_depicts": sorted({q for v in (rec.get("artwork_items") or {}).values()
                                       for q in (v.get("p180") or []) + (v.get("p921") or [])}),
            "year": artwork_year(rec)}


def main():
    args = sys.argv[1:]
    titles = None
    top = None
    out = os.path.join(OUTDIR, "candidates.json")
    if "--titles" in args:
        titles = json.load(open(args[args.index("--titles") + 1]))
    if "--top" in args:
        top = int(args[args.index("--top") + 1])
    if "--out" in args:
        out = args[args.index("--out") + 1]
    recs = [json.loads(l) for l in open(os.path.join(OUTDIR, "files.jsonl"), encoding="utf-8")]
    note_filter = None
    if "--notes" in args:
        sel = json.load(open(args[args.index("--notes") + 1]))
        note_filter = {}
        for s in sel:
            note_filter.setdefault(s["file"], set()).add(str(s["note_id"]))
    if titles:
        recs = [r for r in recs if r["title"] in set(titles)]
    elif "--notes" in args:
        recs = [r for r in recs if r["title"] in note_filter]
    elif top:
        recs = sorted(recs, key=lambda r: -r["n_notes"])[:top]
    result = []
    for rec in recs:
        ctx = build_context(rec)
        for note in rec["notes"]:
            if note_filter and str(note["id"]) not in note_filter.get(rec["title"], set()):
                continue
            ranked, plain, variants, kind = candidates_for_note(note, rec, ctx)
            result.append({"file": rec["title"], "revid": rec["revid"], "m_id": rec["m_id"],
                           "note_id": note["id"], "box": note["params"], "raw": note["text"],
                           "plain": plain, "variants": variants,
                           "links": [l["target"] for l in note["links"]],
                           "ctx_year": ctx["year"], "ctx_artwork_depicts": ctx["artwork_depicts"],
                           "ctx_file_depicts": ctx["file_depicts"], "flags": kind,
                           "cands": [{"qid": q, "score": round(s, 3), "reasons": r,
                                      "label": f.get("label"), "desc": f.get("desc"),
                                      "p31": f.get("p31"), "birth": f.get("birth"), "death": f.get("death"),
                                      "occupation": f.get("occupation")} for q, (s, r, f) in ranked[:5]]})
        json.dump(result, open(out, "w"), ensure_ascii=False, indent=1)
        _cache_save(True)
        sys.stderr.write(f"{rec['title'][:60]} notes={rec['n_notes']}\n")
    print(f"wrote {out}: {len(result)} notes from {len(recs)} files")


if __name__ == "__main__":
    main()
