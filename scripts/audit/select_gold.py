#!/usr/bin/env python3
"""Pick the gold-set notes, stratified by evidence type and capped per file.

Strata (matcher precision differs radically between them):
  A  note-rich files, link-less notes      (the hard majority case)
  B  notes carrying article/other wiki links
  C  notes carrying category links
  D  notes carrying direct :wikidata:Q links (rare, near-perfect evidence)
  T  typical files (1-2 notes, no links)   (the median corpus case)
  N  files with no SDC at all              (nothing to be in sync with)

Writes audit/gold_notes.json (list of {file, note_id}) and audit/gold_titles.json.
"""
import json, os, random
from collections import Counter

OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'
random.seed(20261008)


def link_kind(t):
    t = t.strip().lower()
    if t.startswith((":wikidata:", "wikidata:")):
        return "qid"
    if t.startswith(("user:", "user talk:", "file:", "image:")):
        return None
    if t.startswith(("category:", ":category:")):
        return "cat"
    return "article"


def note_kinds(n):
    ks = {link_kind(l["target"]) for l in n.get("links") or []}
    ks.discard(None)
    return ks or {"none"}


def pick_notes(rec, want_kind, cap):
    """Evenly spaced selection of up to `cap` notes of the wanted evidence kind."""
    ns = [n for n in rec["notes"] if worth(n, want_kind)]
    if not ns:
        return []
    if len(ns) <= cap:
        return ns
    step = len(ns) / cap
    return [ns[int(i * step)] for i in range(cap)]


def worth(n, want_kind):
    ks = note_kinds(n)
    if want_kind == "none":
        return ks == {"none"}
    return want_kind in ks


def main():
    recs = [json.loads(l) for l in open(os.path.join(OUTDIR, "files.jsonl"), encoding="utf-8")]
    for r in recs:
        r["_none"] = sum(1 for n in r["notes"] if note_kinds(n) == {"none"})
        r["_art"] = sum(1 for n in r["notes"] if "article" in note_kinds(n))
        r["_cat"] = sum(1 for n in r["notes"] if "cat" in note_kinds(n))
        r["_qid"] = sum(1 for n in r["notes"] if "qid" in note_kinds(n))

    chosen, seen = [], set()

    def take(pred, key, nfiles, want_kind, cap):
        got = 0
        for r in sorted([x for x in recs if pred(x)], key=key, reverse=True):
            if r["title"] in seen:
                continue
            notes = pick_notes(r, want_kind, cap)
            if not notes:
                continue
            seen.add(r["title"])
            chosen.append((r, notes))
            got += 1
            if got >= nfiles:
                break
        print(f"  {want_kind:8s} files={got} notes={sum(len(n) for _, n in chosen[-got:])}")

    print("strata:")
    take(lambda r: r["_none"] >= 4, lambda r: r["_none"], 6, "none", 6)         # A hard majority
    take(lambda r: r["_art"] >= 3, lambda r: r["_art"], 6, "article", 5)        # B article links
    take(lambda r: r["_cat"] >= 3, lambda r: r["_cat"], 3, "cat", 4)            # C category links
    take(lambda r: r["_qid"] >= 1, lambda r: r["_qid"], 2, "qid", 5)            # D direct QIDs
    take(lambda r: r["_none"] >= 1, lambda r: r["n_notes"], 6, "none", 2)       # T typical small files
    take(lambda r: not (r.get("sdc") or {}).get("props"), lambda r: r["n_notes"], 4, "none", 2)  # N no SDC

    notes = [{"file": r["title"], "note_id": n["id"], "evidence": sorted(note_kinds(n))[0]}
             for r, ns in chosen for n in ns]
    json.dump(notes, open(os.path.join(OUTDIR, "gold_notes.json"), "w"), ensure_ascii=False, indent=1)
    json.dump([r["title"] for r, _ in chosen], open(os.path.join(OUTDIR, "gold_titles.json"), "w"))
    print(f"\ngold set: {len(chosen)} files, {len(notes)} notes")
    print("evidence mix:", dict(Counter(n["evidence"] for n in notes)))
    print("evidence via multi-link:", dict(Counter(tuple(sorted(note_kinds(n))) for r, ns in chosen for n in ns
                                                   if len(note_kinds(n)) > 1)))
    for r, ns in chosen:
        print(f"  {len(ns):2d}/{r['n_notes']:3d} notes  sdcdepicts={len((r.get('sdc') or {}).get('p180') or []):2d}  "
              f"art={r['_art']:3d} cat={r['_cat']:3d} none={r['_none']:3d}  {r['title'][:62]}")


if __name__ == "__main__":
    main()
