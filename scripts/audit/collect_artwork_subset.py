#!/usr/bin/env python3
"""Collector for the Commons image-notes / SDC synchronicity audit (READ-ONLY).

Audits every Commons file that transcludes BOTH {{ImageNote}} and {{Artwork}}:
  - wikitext  -> notes (box, text, links), template params (wikidata=, categories)
  - imageinfo -> current width/height (to detect stale note geometry)
  - SDC       -> all statements, P180 with P2677 qualifiers, captions
  - Wikidata  -> linked artwork item's depicts/main subject (context seed)

Writes one JSON line per file to audit/files.jsonl (append, crash-safe),
plus audit/manifest.json and audit/progress.txt.

No writes to any wiki. Usage: python3 collect_artwork_subset.py [limit]
"""
import json, os, re, sys, time, urllib.parse, urllib.request

UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) WikiButler-ImageNoteAudit/1.0"
OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'
FILES = os.path.join(OUTDIR, "files.jsonl")
PROG = os.path.join(OUTDIR, "progress.txt")
LIMIT = int(sys.argv[1]) if len(sys.argv) > 1 else 0

os.makedirs(OUTDIR, exist_ok=True)
NOTE_RE = re.compile(r"\{\{\s*ImageNote\s*\|([^}]*)\}\}(.*?)\{\{\s*ImageNoteEnd", re.S | re.I)
LINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
sys.stderr.write(f"start {time.strftime('%Y-%m-%d %H:%M:%S')}\n")


def api(host, params, tries=6, post=None):
    """GET a MediaWiki API endpoint with retries/backoff. Returns parsed JSON.

    Also retries API-level errors reported with HTTP 200 (notably "maxlag",
    which Wikidata raises when its query service is lagging).
    """
    params = dict(params)
    params.setdefault("format", "json")
    # maxlag guards shared cluster load; WDQS lag (wikidata.org) is usually the query
    # service lagging, which would block every read for us — only apply it on Commons.
    if "wikidata.org" not in host:
        params.setdefault("maxlag", "5")
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    delay = 2.0
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            d = json.load(urllib.request.urlopen(req, timeout=90))
            if isinstance(d, dict) and "error" in d:
                code = d["error"].get("code", "")
                if code in ("maxlag", "readonly", "ratelimited", "internal_api_error_DBQueryError") and attempt < tries - 1:
                    sys.stderr.write(f"  retry [{code}] {host}\n")
                    time.sleep(max(delay, float(d["error"].get("lag", 0)) or delay))
                    delay = min(delay * 2, 30)
                    continue
                raise RuntimeError(f"API error {code}: {d['error'].get('info')}")
            return d
        except Exception as e:
            if attempt == tries - 1:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 30)
    raise RuntimeError("unreachable")


def file_list():
    """All Commons files transcluding {{ImageNote}} and {{Artwork}} (PetScan, fallback: CirrusSearch)."""
    url = ("https://petscan.wmcloud.org/?language=commons&project=wikimedia&ns%5B6%5D=1"
           "&templates=ImageNote%0AArtwork&depth=0&combination=subset&doit=1&format=json&sortby=title")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        d = json.load(urllib.request.urlopen(req, timeout=180))
        pages = d["*"][0]["a"]["*"]
        titles = [p["title"] if p["title"].startswith("File:") else "File:" + p["title"] for p in pages]
        if len(titles) > 1000:
            return titles, "petscan"
    except Exception as e:
        sys.stderr.write(f"petscan failed: {e}\n")
    # fallback: CirrusSearch, partitioned by first letter to dodge the 10k offset cap
    titles = []
    for ch in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789":
        off = 0
        while True:
            d = api("commons.wikimedia.org", {"action": "query", "list": "search", "srnamespace": "6",
                    "srsearch": f'hastemplate:"ImageNote" hastemplate:"Artwork" intitle:/^{ch}/i',
                    "srlimit": "500", "sroffset": str(off)})
            hits = d["query"]["search"]
            titles += [h["title"] for h in hits]
            sys.stderr.write(f"  {ch}: +{len(hits)} (total {len(titles)})\n")
            if len(hits) < 500:
                break
            off += 500
            if off >= 10000:
                break
            time.sleep(0.5)
    return list(dict.fromkeys(titles)), "cirrussearch-partitioned"


def parse_notes(text):
    notes = []
    for m in NOTE_RE.finditer(text):
        params = {}
        for kv in m.group(1).split("|"):
            if "=" in kv:
                k, v = kv.split("=", 1)
                params[k.strip()] = v.strip()
        body = m.group(2).strip()
        links = []
        for lm in LINK_RE.finditer(body):
            raw = lm.group(1)
            tgt = raw.split("|")[0].split("#")[0].strip()
            if tgt:
                links.append({"raw": raw, "target": tgt, "label": raw.split("|")[1] if "|" in raw else None})
        notes.append({"id": params.get("id") or params.get("1"), "params": params,
                      "text": body, "links": links})
    return notes


def page_template_params(text):
    """Pull wikidata= and other params from Artwork/Photograph/Map/Information templates.

    Nested templates ({{en|...}}) break naive non-greedy matching, so take a fixed-size
    window after the template's opening braces instead of trying to find its close.
    """
    out = {}
    for tmpl in ("Artwork", "Photograph", "Map", "Art Photo", "Information"):
        m = re.search(r"\{\{\s*" + tmpl + r"\b", text, re.I)
        if m:
            body = text[m.end():m.end() + 3000]
            for key in ("wikidata", "depicts", "date", "object type", "source", "artist",
                        "author", "accession number", "permission"):
                mm = re.search(r"\|\s*" + key + r"\s*=\s*([^\n|]+)", body, re.I)
                if mm:
                    out[f"{tmpl}.{key}"] = mm.group(1).strip()[:120]
    return out


def main():
    titles, src = file_list()
    if LIMIT:
        titles = titles[:LIMIT]
    manifest = {"generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "list_source": src,
                "requested": len(titles), "ua": UA}
    json.dump(manifest, open(os.path.join(OUTDIR, "manifest.json"), "w"), indent=1)
    sys.stderr.write(f"file list: {len(titles)} ({src})\n")
    done = set()
    if os.path.exists(FILES):
        for line in open(FILES, encoding="utf-8"):
            try:
                done.add(json.loads(line)["title"])
            except Exception:
                pass
    sys.stderr.write(f"already collected: {len(done)}\n")
    todo = [t for t in titles if t not in done]
    dropped = [0]
    B = 40
    for i in range(0, len(todo), B):
        batch = todo[i:i + B]
        # 1. wikitext
        wt = {}
        for j in range(0, len(batch), 20):
            sub = batch[j:j + 20]
            d = api("commons.wikimedia.org", {"action": "query", "prop": "revisions|info|imageinfo",
                    "rvslots": "main", "rvprop": "content|ids", "inprop": "url",
                    "iiprop": "size|mime|sha1", "titles": "|".join(sub)})
            for p in d.get("query", {}).get("pages", {}).values():
                if "missing" in p:
                    continue
                slot = (p.get("revisions", [{}])[0].get("slots", {}).get("main", {}) or {})
                # formatversion=1 puts revision text under "*", formatversion=2 under "content"
                txt = slot.get("content") or slot.get("*") or ""
                ii = (p.get("imageinfo") or [{}])[0]
                wt[p["title"]] = {"text": txt, "revid": p.get("lastrevid"), "pageid": p["pageid"],
                                  "w": ii.get("width"), "h": ii.get("height"), "mime": ii.get("mime")}
            time.sleep(0.6)
        # 2. SDC
        sdc = {}
        for j in range(0, len(batch), 25):
            sub = batch[j:j + 25]
            d = api("commons.wikimedia.org", {"action": "wbgetentities", "sites": "commonswiki",
                    "titles": "|".join(sub), "props": "claims|labels"})
            for mid, e in (d.get("entities") or {}).items():
                if "missing" in e:
                    continue
                cl = e.get("claims") or e.get("statements") or {}
                p180 = []
                for c in cl.get("P180", []):
                    sn = c.get("mainsnak", {})
                    dv = sn.get("datavalue")
                    if not dv:
                        continue
                    pos = c.get("qualifiers", {}).get("P2677", [{}])[0].get("datavalue", {})
                    p180.append({"qid": dv["value"]["id"],
                                 "rank": c.get("rank"),
                                 "pos": (pos.get("value") if pos else None),
                                 "qualifiers": sorted(c.get("qualifiers", {}).keys()),
                                 "title": (e.get("title") or "")})
                sdc[mid] = {"title": e.get("title"), "p180": p180,
                            "props": sorted(cl.keys()),
                            "n_statements": sum(len(v) for v in cl.values()),
                            "captions": {k: v["value"] for k, v in (e.get("labels") or {}).items()}}
            time.sleep(0.6)
        # 3. linked artwork items (context seeds)
        items = {}
        for t in batch:
            m = re.search(r"\|\s*wikidata\s*=\s*(Q\d+)", wt.get(t, {}).get("text", "") or "", re.I)
            if m:
                items.setdefault(m.group(1), set()).add(t)
        item_claims = {}
        keys = list(items)
        for j in range(0, len(keys), 25):
            d = api("www.wikidata.org", {"action": "wbgetentities", "ids": "|".join(keys[j:j + 25]),
                    "props": "claims|labels", "languages": "en|mul"})
            for qid, e in (d.get("entities") or {}).items():
                if "missing" in e:
                    continue
                cl = e.get("claims") or {}
                item_claims[qid] = {
                    "label": (e.get("labels", {}).get("en") or e.get("labels", {}).get("mul") or {}).get("value"),
                    "p180": [c["mainsnak"]["datavalue"]["value"]["id"] for c in cl.get("P180", [])
                             if c.get("mainsnak", {}).get("datavalue")],
                    "p921": [c["mainsnak"]["datavalue"]["value"]["id"] for c in cl.get("P921", [])
                             if c.get("mainsnak", {}).get("datavalue")],
                    "p170": [c["mainsnak"]["datavalue"]["value"]["id"] for c in cl.get("P170", [])
                             if c.get("mainsnak", {}).get("datavalue")],
                    "props": sorted(cl.keys())}
            time.sleep(0.6)
        # 4. write
        with open(FILES, "a", encoding="utf-8") as fh:
            for t in batch:
                pi = wt.get(t)
                if not pi:
                    continue
                notes = parse_notes(pi["text"])
                # keep only genuine artefact records: page must carry BOTH templates
                if not notes or not re.search(r"\{\{\s*Artwork\b", pi["text"], re.I):
                    dropped[0] += 1
                    continue
                pageid = pi["pageid"]
                art_items = [q for q, ts in items.items() if t in ts]
                rec = {"title": t, "revid": pi["revid"], "m_id": f"M{pageid}",
                       "w": pi["w"], "h": pi["h"], "mime": pi["mime"],
                       "dims_match_notes": (str(pi["w"]) == notes[0]["params"].get("dimx")
                                            and str(pi["h"]) == notes[0]["params"].get("dimy")),
                       "n_notes": len(notes), "notes": notes,
                       "template_params": page_template_params(pi["text"]),
                       "artwork_items": {q: item_claims.get(q, {}) for q in art_items},
                       "sdc": sdc.get(f"M{pageid}", {"p180": [], "props": [], "n_statements": 0, "captions": {}})}
                fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        n = len(done) + min(i + B, len(todo))
        with open(PROG, "w") as fh:
            fh.write(f"{n}/{len(titles)} {time.strftime('%H:%M:%S')}\n")
        sys.stderr.write(f"{n}/{len(titles)}\n")


if __name__ == "__main__":
    main()
