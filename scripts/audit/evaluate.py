#!/usr/bin/env python3
"""Score the matcher against the gold set.

Inputs : audit/<gold>.json  (list of {file, note_id, gold, kind, note})
         audit/candidates_gold.json (matcher output)
Outputs: printed table + audit/matcher_evaluation.json

Metrics
  coverage        : share of gold notes the matcher produced candidates for
  top1/hit@3      : is the gold QID the top-ranked / within top-3 candidate
  threshold sweep : at each confidence cut-off, how many proposals would be published,
                    and how many of those are correct (precision) — the number that
                    decides whether a semi-automatic import is safe
  abstain value   : notes where gold has no bindable entity (kind ABSTAIN) and the
                    matcher proposed something anyway (false-positive risk)
"""
import json, os, sys
from collections import Counter, defaultdict

OUTDIR = '/Users/alih/Documents/ai/wikibento-audit-data'


def evidence(note):
    ks = set()
    for t in note.get("links") or []:
        t = t.lower()
        if t.startswith((":wikidata:", "wikidata:")):
            ks.add("qid")
        elif t.startswith(("user:", "user talk:", "file:", "image:")):
            pass
        elif t.startswith(("category:", ":category:")):
            ks.add("cat")
        else:
            ks.add("article")
    if not ks:
        return "none"
    return "qid" if "qid" in ks else ("cat" if "cat" in ks else "article")


def main():
    gold_file = sys.argv[1] if len(sys.argv) > 1 else os.path.join(OUTDIR, "gold_labels.json")
    cand_file = sys.argv[2] if len(sys.argv) > 2 else os.path.join(OUTDIR, "candidates_gold.json")
    gold = json.load(open(gold_file, encoding="utf-8"))
    cands = json.load(open(cand_file, encoding="utf-8"))
    index = {(c["file"], str(c["note_id"])): c for c in cands}

    rows = []
    for g in gold:
        key = (g["file"], str(g["note_id"]))
        c = index.get(key)
        if not c:
            rows.append({**g, "found": False, "evidence": None, "top1": None, "top3": [], "score": 0.0})
            continue
        top = c["cands"]
        rows.append({**g, "found": True, "evidence": evidence(c), "top1": top[0]["qid"] if top else None,
                     "score": top[0]["score"] if top else 0.0,
                     "top3": [t["qid"] for t in top[:3]],
                     "reasons": (top[0]["reasons"] if top else [])})

    n = len(rows)
    by_ev = defaultdict(lambda: Counter())
    for r in rows:
        ev = r["evidence"] or "unknown"
        by_ev[ev]["n"] += 1
        bindable = bool(r.get("gold"))
        if bindable:
            by_ev[ev]["gold_bindable"] += 1
            if r["top1"] == r["gold"]:
                by_ev[ev]["top1_ok"] += 1
            elif r["gold"] in (r["top3"] or []):
                by_ev[ev]["top3_only"] += 1
            else:
                by_ev[ev]["missed"] += 1
        else:
            by_ev[ev]["should_abstain"] += 1
            if r["top1"]:
                by_ev[ev]["proposed_anyway"] += 1

    sweep = []
    for t in (0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95):
        pub = [r for r in rows if r["found"] and r.get("gold") and r["score"] >= t]
        correct = [r for r in pub if r["top1"] == r["gold"]]
        sweep.append({"threshold": t, "proposals": len(pub),
                      "precision": round(len(correct) / len(pub), 3) if pub else None,
                      "coverage_of_bindable": round(len(pub) / max(1, sum(1 for r in rows if r.get("gold"))), 3)})

    res = {"gold_notes": n, "notes_matched_to_candidates": sum(1 for r in rows if r["found"]),
           "gold_bindable": sum(1 for r in rows if r.get("gold")),
           "gold_should_abstain": sum(1 for r in rows if not r.get("gold")),
           "overall": {"top1_correct": sum(1 for r in rows if r.get("gold") and r["top1"] == r["gold"]),
                       "top3_contains_gold": sum(1 for r in rows if r.get("gold") and
                                                 (r["top1"] == r["gold"] or r["gold"] in (r["top3"] or []))),
                       "missed": sum(1 for r in rows if r.get("gold") and r["top1"] != r["gold"]
                                     and r["gold"] not in (r["top3"] or []))},
           "by_evidence": {k: dict(v) for k, v in by_ev.items()},
           "threshold_sweep": sweep,
           "errors": [{"file": r["file"], "note_id": r["note_id"], "gold": r.get("gold"),
                       "top1": r["top1"], "score": r["score"], "kind": r.get("kind"),
                       "text": (r.get("plain") or "")[:70], "evidence": r["evidence"]}
                      for r in rows if r.get("gold") and r["top1"] != r["gold"]][:40],
           "false_positive_risks": [{"file": r["file"], "note_id": r["note_id"], "top1": r["top1"],
                                     "score": r["score"], "text": (r.get("plain") or "")[:70]}
                                    for r in rows if not r.get("gold") and r["top1"]][:20]}
    json.dump(res, open(os.path.join(OUTDIR, "matcher_evaluation.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in res.items() if k not in ("errors", "false_positive_risks")},
                     indent=1, ensure_ascii=False))
    print("\nERRORS:")
    for e in res["errors"]:
        print(f"  {e['kind']:10s} {e['evidence']:7s} gold={e['gold']} top1={e['top1']} s={e['score']} | {e['text']!r}")


if __name__ == "__main__":
    main()
