#!/usr/bin/env python3
"""Note-level synchronicity, v2 (batched).

Is each image note's subject already represented in the file's depicts statements?

  explicit : a note link (:wikidata:Q... or a wiki page link) resolves to a QID that the file depicts
  text     : a depicts label/alias of the file appears (word boundary, >=4 chars) in the note text
  absent   : neither — the note carries content the structured data does not have

Link resolution is batched per wiki (50 titles/request) instead of one request per note.
Writes audit/synchronicity.json.
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from collections import Counter, defaultdict

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) WikiButler-ImageNoteAudit/1.0"
OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'
CACHE = os.path.join(OUTDIR, "api_cache_cc.json")
_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


def api(host, params, tries=5, use_cache=True):
    key = host + "|" + urllib.parse.urlencode(sorted(params.items()))
    if use_cache and key in _cache:
        return _cache[key]
    params = dict(params)
    params.setdefault("format", "json")
    if "wikidata.org" not in host:
        params.setdefault("maxlag", "5")
    # long title lists must go in the POST body
    data = urllib.parse.urlencode(params).encode()
    url = f"https://{host}/w/api.php"
    delay = 1.5
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": UA})
            d = json.load(urllib.request.urlopen(req, timeout=120))
            if isinstance(d, dict) and "error" in d:
                if attempt < tries - 1:
                    time.sleep(delay)
                    delay = min(delay * 2, 30)
                    continue
                raise RuntimeError(d["error"])
            if use_cache:
                _cache[key] = d
                if len(_cache) % 20 == 0:
                    json.dump(_cache, open(CACHE, "w"))
            time.sleep(0.3)
            return d
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 30)
    raise RuntimeError("unreachable")


TPL_INNER = re.compile(r"\{\{([^{}]*)\}\}")
LANG_PIPE_CC = re.compile(r"^(?:langswitch\s*\|)?([a-z]{2,3}(?:-[a-z]+)?)\s*\|(?:1=)?(.+)$", re.I | re.S)
LANG_EQ_CC = re.compile(r"^(?:langswitch\s*\|)?([a-z]{2,3}(?:-[a-z]+)?)\s*=\s*(.+)$", re.I | re.S)
MULTI_EQ_CC = re.compile(r"([a-z]{2,3}(?:-[a-z]+)?)\s*=\s*([^|]+)")
TMPL_RE = re.compile(r"\{\{[^{}]*\}\}")


def _tmpl_keep(m):
    """Language templates carry the actual note text ({{en|Time}}, {{en|1=X}}, {{Langswitch|en=X}})."""
    body = m.group(1).strip()
    if body.lower().startswith("langswitch"):
        pairs = {k.lower(): v.strip() for k, v in MULTI_EQ_CC.findall(body)}
        return pairs.get("en") or (next(iter(pairs.values())) if pairs else " ")
    for rx in (LANG_PIPE_CC, LANG_EQ_CC):
        mm = rx.match(body)
        if mm and not mm.group(2).strip().lower().startswith(("http", "file:", "image:", "category:")):
            return mm.group(2)
    return " "


def plain_text(text):
    """Delegate to the matcher's parser so both tools agree on note text (see matcher.note_variants)."""
    import matcher
    return matcher.note_variants(text)[0]


def norm(s):
    s = unicodedata.normalize("NFKD", s.lower())
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def parse_link(target):
    t = target.strip()
    low = t.lower()
    if low.startswith(("user:", "user talk:", "file:", "image:", "special:")):
        return None
    if low.startswith((":wikidata:", "wikidata:")):
        q = t.split(":")[-1].strip()
        return ("QID", q.upper()) if re.fullmatch(r"[Qq]\d+", q) else None
    pre = re.match(r"^:?([a-z]{2,3}(?:-[a-z]+)?|commons|w):(.+)$", t)
    if pre:
        lang, title = pre.group(1), pre.group(2)
        return ("WIKI", ("commons" if lang == "commons" else ("en" if lang == "w" else lang), title))
    if low.startswith(("category:", ":category:")):
        return ("WIKI", ("commons", "Category:" + t.split(":", 1)[1]))
    return ("WIKI", ("commons", t.lstrip(":")))


def host_for(wiki):
    return "commons.wikimedia.org" if wiki == "commons" else f"{wiki}.wikipedia.org"


def main():
    recs = [json.loads(l) for l in open(os.path.join(OUTDIR, "files.jsonl"), encoding="utf-8")]
    # ---- 1. collect distinct link targets per wiki, and which files/notes use them
    wanted = defaultdict(set)          # wiki -> set(titles)
    for r in recs:
        for n in r["notes"]:
            for l in n.get("links") or []:
                p = parse_link(l["target"])
                if p and p[0] == "WIKI":
                    wanted[p[1][0]].add(p[1][1])
    print(f"distinct (wiki,title) pairs: {sum(len(v) for v in wanted.values())} across {len(wanted)} wikis",
          file=sys.stderr)
    # ---- 2. batch-resolve to QIDs
    title_qid = {}
    for wiki, titles in wanted.items():
        tl = sorted(titles)
        for i in range(0, len(tl), 50):
            chunk = tl[i:i + 50]
            try:
                d = api(host_for(wiki), {"action": "query", "prop": "pageprops",
                                         "ppprop": "wikibase_item", "redirects": "1",
                                         "titles": "|".join(chunk)})
            except Exception as e:
                print(f"  resolve fail {wiki}: {e}", file=sys.stderr)
                continue
            q = d.get("query", {})
            # map normalised/redirected titles back to the requested ones
            alias = {}
            for k in ("normalized", "redirects"):
                for m in q.get(k, []):
                    alias[m["to"]] = m["from"]
            for p in (q.get("pages", {}) or {}).values():
                t = p.get("title")
                qid = (p.get("pageprops") or {}).get("wikibase_item")
                if not qid:
                    continue
                key = t
                seen = set()
                while key in alias and alias[key] not in seen:
                    seen.add(key)
                    key = alias[key]
                title_qid[(wiki, key)] = qid
                title_qid[(wiki, t)] = qid
            print(f"  {wiki} {i + len(chunk)}/{len(tl)} resolved={len(title_qid)}", file=sys.stderr)
    json.dump(_cache, open(CACHE, "w"))

    # ---- 3. depicts labels/aliases for text-overlap test
    all_qids = sorted({c["qid"] for r in recs for c in (r.get("sdc") or {}).get("p180", [])})
    labels = {}
    LANGS = "en|mul|de|fr|es|it|pt|ru|nl|sv|pl|uk|zh|ja"
    for i in range(0, len(all_qids), 50):
        d = api("www.wikidata.org", {"action": "wbgetentities", "ids": "|".join(all_qids[i:i + 50]),
                "props": "labels|aliases", "languages": LANGS})
        for q, e in (d.get("entities") or {}).items():
            vals = [v["value"] for v in (e.get("labels") or {}).values()]
            for al in (e.get("aliases") or {}).values():
                vals += [a["value"] for a in al]
            labels[q] = sorted({norm(v) for v in vals if len(v) >= 4}, key=len, reverse=True)
    json.dump(_cache, open(CACHE, "w"))

    # ---- 4. verdicts
    out = {"files": len(recs), "notes": 0, "files_without_depicts": 0,
           "notes_on_files_without_depicts": 0, "explicit_link_present": 0, "explicit_link_absent": 0,
           "text_overlap_present": 0, "absent": 0,
           "notes_with_links": 0, "links_resolved": 0, "links_unresolved": 0,
           "note_examples": {"present": [], "absent": []}}
    per_file = []
    for r in recs:
        deps = [c["qid"] for c in (r.get("sdc") or {}).get("p180", [])]
        if not deps:
            out["files_without_depicts"] += 1
        dep_labels = [(q, lab) for q in deps for lab in labels.get(q, [])]
        f_present = f_absent = 0
        for n in r["notes"]:
            out["notes"] += 1
            txt = norm(plain_text(n["text"]))
            if not deps:
                out["notes_on_files_without_depicts"] += 1
                continue
            verdict = None
            links = n.get("links") or []
            if links:
                out["notes_with_links"] += 1
            for l in links:
                p = parse_link(l["target"])
                if not p:
                    continue
                qid = p[1] if p[0] == "QID" else title_qid.get((p[1][0], p[1][1]))
                if qid:
                    out["links_resolved"] += 1
                else:
                    out["links_unresolved"] += 1
                    continue
                if qid in deps:
                    verdict = ("explicit", qid)
                    out["explicit_link_present"] += 1
                    break
                verdict = verdict or ("explicit_absent", qid)
            if verdict is None:
                for q, lab in dep_labels:
                    if lab and re.search(r"\b" + re.escape(lab) + r"\b", txt):
                        verdict = ("text", q, lab)
                        out["text_overlap_present"] += 1
                        break
            if verdict is None:
                out["absent"] += 1
                f_absent += 1
                if len(out["note_examples"]["absent"]) < 30:
                    out["note_examples"]["absent"].append({"file": r["title"], "note": n["text"][:110],
                                                           "depicts": deps[:4]})
            elif verdict[0] == "explicit_absent":
                out["explicit_link_absent"] += 1
                f_absent += 1
            else:
                f_present += 1
                if len(out["note_examples"]["present"]) < 30:
                    out["note_examples"]["present"].append({"file": r["title"], "note": n["text"][:110],
                                                            "how": verdict[0], "qid": verdict[1]})
        per_file.append({"file": r["title"], "notes": r["n_notes"], "depicts": len(deps),
                         "in_sync": f_present, "not_in_sync": f_absent})
    json.dump(out, open(os.path.join(OUTDIR, "synchronicity.json"), "w"), indent=1, ensure_ascii=False)
    json.dump(per_file, open(os.path.join(OUTDIR, "synchronicity_per_file.json"), "w"), ensure_ascii=False)
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
