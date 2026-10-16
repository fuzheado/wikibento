#!/usr/bin/env python3
"""Aggregate audit/files.jsonl into the corpus-level synchronicity report.

Read-only. Writes audit/audit_summary.json and prints a markdown-style summary.

Metrics computed:
  coverage        : files/notes audited, notes per file distribution
  geometry        : notes whose dimx/dimy still match the current file (stale boxes)
  sdc             : files with any statement, with depicts, with position-qualified depicts, captions
  link layer      : notes with links, link types, resolution rate against the file's own depicts
  context seeds   : files with a linked artwork item, and how rich those seeds are
  volume          : how many P180+P2677 statements a full import would mean
"""
import json, os, re, sys
from collections import Counter, defaultdict

OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'
FILES = os.path.join(OUTDIR, "files.jsonl")
UA = "HermesAgent/1.0 (https://en.wikipedia.org/wiki/User:Fuzheado) WikiButler-ImageNoteAudit/1.0"


def link_kind(target):
    t = target.strip().lower()
    if t.startswith((":wikidata:", "wikidata:")):
        return "wikidata_qid"
    if t.startswith(("user:", "user talk:")):
        return "user"
    if t.startswith(("file:", "image:")):
        return "file(other image)"
    if t.startswith(("category:", ":category:")):
        return "category"
    if re.match(r"^:?[a-z]{2,3}(-[a-z]+)?:", t):
        return "interwiki_article"
    return "bare_title"


def main():
    recs = []
    bad = 0
    for line in open(FILES, encoding="utf-8"):
        try:
            recs.append(json.loads(line))
        except Exception:
            bad += 1
    n_files = len(recs)
    n_notes = sum(r["n_notes"] for r in recs)
    notes_per = sorted(r["n_notes"] for r in recs)
    dist = {"1": 0, "2-4": 0, "5-9": 0, "10-19": 0, "20+": 0}
    for n in notes_per:
        dist["1" if n == 1 else "2-4" if n <= 4 else "5-9" if n <= 9 else "10-19" if n <= 19 else "20+"] += 1

    geometry = {"match": 0, "stale": 0, "unknown": 0}
    for r in recs:
        if r.get("dims_match_notes") is True:
            geometry["match"] += 1
        elif r.get("dims_match_notes") is False:
            geometry["stale"] += 1
        else:
            geometry["unknown"] += 1

    sdc_files = Counter()
    sdc_props = Counter()
    p180_per_file = []
    for r in recs:
        s = r.get("sdc") or {}
        props = s.get("props") or []
        for p in props:
            sdc_props[p] += 1
        if s.get("n_statements"):
            sdc_files["any_statement"] += 1
        p180 = s.get("p180") or []
        p180_per_file.append(len(p180))
        if p180:
            sdc_files["has_depicts"] += 1
        if any(c.get("pos") for c in p180):
            sdc_files["depicts_with_position"] += 1
        if s.get("captions"):
            sdc_files["has_caption"] += 1
        if s.get("p180") is None:
            sdc_files["sdc_missing"] += 1

    link_stats = Counter()
    note_kinds = Counter()
    resolved_examples = []
    for r in recs:
        deps = {c["qid"] for c in (r.get("sdc") or {}).get("p180", [])}
        for n in r["notes"]:
            links = n.get("links") or []
            if not links:
                note_kinds["notes_without_link"] += 1
            else:
                note_kinds["notes_with_link"] += 1
            for l in links:
                link_stats[link_kind(l["target"])] += 1
            for l in links:
                if link_kind(l["target"]) == "wikidata_qid":
                    q = l["target"].split(":")[-1].upper()
                    link_stats["qid_in_file_depicts" if q in deps else "qid_not_in_file_depicts"] += 1

    seeds = Counter()
    seed_p180_total = 0
    for r in recs:
        items = r.get("artwork_items") or {}
        if items:
            seeds["files_with_artwork_item"] += 1
            for q, v in items.items():
                seed_p180_total += len(v.get("p180") or []) + len(v.get("p921") or [])
                seeds["items_with_depicts"] += 1 if (v.get("p180") or v.get("p921")) else 0
        if (r.get("template_params") or {}).get("Artwork.wikidata"):
            seeds["artwork_wikidata_param"] += 1

    mime = Counter(r.get("mime") for r in recs)
    biggest = sorted(recs, key=lambda r: -r["n_notes"])[:15]
    top_depicts = sorted(recs, key=lambda r: -len((r.get("sdc") or {}).get("p180") or []))[:10]

    summary = {
        "audited": {"files": n_files, "unparsable_lines": bad, "notes": n_notes,
                    "notes_per_file": {"mean": round(n_notes / max(n_files, 1), 2),
                                       "median": notes_per[len(notes_per) // 2] if notes_per else 0,
                                       "max": max(notes_per) if notes_per else 0,
                                       "distribution": dist}},
        "geometry": geometry,
        "sdc": dict(sdc_files), "sdc_property_frequency": dict(sdc_props.most_common(25)),
        "depicts_per_file": {"zero": sum(1 for x in p180_per_file if x == 0),
                             "one": sum(1 for x in p180_per_file if x == 1),
                             "two_plus": sum(1 for x in p180_per_file if x >= 2),
                             "total_depicts": sum(p180_per_file)},
        "notes": {"notes_with_link": note_kinds["notes_with_link"],
                  "notes_without_link": note_kinds["notes_without_link"],
                  "links_total": sum(link_stats[k] for k in ("interwiki_article", "bare_title", "category",
                                                             "wikidata_qid", "user", "file(other image)")),
                  "link_kinds": dict(link_stats)},
        "context_seeds": dict(seeds) | {"seed_depicts_total": seed_p180_total},
        "mime": dict(mime.most_common(8)),
        "most_annotated_files": [{"title": r["title"], "notes": r["n_notes"],
                                  "depicts": len((r.get("sdc") or {}).get("p180") or [])} for r in biggest],
        "most_depicts_files": [{"title": r["title"], "depicts": len((r.get("sdc") or {}).get("p180") or [])}
                               for r in top_depicts],
        "import_volume_estimate": {"candidate_claims": n_notes,
                                   "writes_if_qualifier_and_reference_added": n_notes * 3},
    }
    json.dump(summary, open(os.path.join(OUTDIR, "audit_summary.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps(summary, indent=1, ensure_ascii=False))
    return summary


if __name__ == "__main__":
    main()
