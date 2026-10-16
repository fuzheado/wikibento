#!/usr/bin/env python3
"""Note-level synchronicity: is each image note's subject already represented in the file's SDC?

Read-only. Two evidence paths, deliberately conservative:

  explicit  : the note contains a [[:wikidata:Q...]] or an interwiki/bare wiki link whose target
              page maps to a QID that is present in the file's depicts statements.
  text      : a depicts label/alias of the file appears (word-boundary, >=4 chars) in the note text.

Anything else counts as "absent" — i.e. the note carries content the structured data does not have.
Writes audit/synchronicity.json.
"""
import json, os, re, sys, time, unicodedata, urllib.parse, urllib.request
from collections import Counter

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) WikiButler-ImageNoteAudit/1.0"
OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'
CACHE = os.path.join(OUTDIR, "api_cache_cc.json")
_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}


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


TMPL_RE = re.compile(r"\{\{[^{}]*\}\}")


def plain_text(text):
    t = TMPL_RE.sub(" ", text)
    t = re.sub(r"\[\[([^\]\|]+)\|([^\]]+)\]\]", r"\2", t)
    t = re.sub(r"\[\[([^\]]+)\]\]", r"\1", t)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


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


def main():
    recs = [json.loads(l) for l in open(os.path.join(OUTDIR, "files.jsonl"), encoding="utf-8")]
    all_qids = sorted({c["qid"] for r in recs for c in (r.get("sdc") or {}).get("p180", [])})
    print(f"files={len(recs)} distinct depicts QIDs={len(all_qids)}", file=sys.stderr)
    labels = {}
    LANGS = "en|mul|de|fr|es|it|pt|ru|nl|sv|pl"
    for i in range(0, len(all_qids), 50):
        d = api("www.wikidata.org", {"action": "wbgetentities", "ids": "|".join(all_qids[i:i + 50]),
                "props": "labels|aliases", "languages": LANGS})
        for q, e in (d.get("entities") or {}).items():
            vals = [v["value"] for v in (e.get("labels") or {}).values()]
            for al in (e.get("aliases") or {}).values():
                vals += [a["value"] for a in al]
            labels[q] = sorted({norm(v) for v in vals if len(v) >= 4}, key=len, reverse=True)
        print(f"  labels {i + len(all_qids[i:i + 50])}/{len(all_qids)}", file=sys.stderr)
    json.dump(_cache, open(CACHE, "w"))

    out = {"files": len(recs), "notes": 0, "files_without_depicts": 0,
           "notes_no_depicts_on_file": 0, "explicit_link_present": 0, "explicit_link_absent": 0,
           "text_overlap_present": 0, "absent": 0, "note_examples": {"present": [], "absent": []}}
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
                out["notes_no_depicts_on_file"] += 1
                continue
            verdict = None
            for l in n.get("links") or []:
                p = parse_link(l["target"])
                if not p:
                    continue
                qid = p[1] if p[0] == "QID" else (pageprops_qid(*p[1]) if p[0] == "WIKI" else None)
                if qid and qid in deps:
                    verdict = ("explicit", qid)
                    out["explicit_link_present"] += 1
                    break
                if qid and qid not in deps:
                    verdict = ("explicit_absent", qid)
            if verdict is None:
                for q, lab in dep_labels:
                    if lab and len(lab) >= 4 and re.search(r"\b" + re.escape(lab) + r"\b", txt):
                        verdict = ("text", q, lab)
                        out["text_overlap_present"] += 1
                        break
            if verdict is None:
                out["absent"] += 1
                f_absent += 1
                if len(out["note_examples"]["absent"]) < 25:
                    out["note_examples"]["absent"].append({"file": r["title"], "note": n["text"][:120],
                                                          "depicts": deps[:5]})
            elif verdict[0] == "explicit_absent":
                out["explicit_link_absent"] += 1
                f_absent += 1
            else:
                f_present += 1
                if len(out["note_examples"]["present"]) < 25:
                    out["note_examples"]["present"].append({"file": r["title"], "note": n["text"][:120],
                                                            "how": verdict[0], "qid": verdict[1]})
        per_file.append((r["title"], r["n_notes"], len(deps), f_present, f_absent))
    json.dump(out, open(os.path.join(OUTDIR, "synchronicity.json"), "w"), indent=1, ensure_ascii=False)
    json.dump(per_file, open(os.path.join(OUTDIR, "synchronicity_per_file.json"), "w"), ensure_ascii=False)
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
