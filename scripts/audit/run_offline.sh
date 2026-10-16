#!/bin/sh
# The five analysis steps, in order, offline (the shipped API caches make it so).
# The shipped outputs are copied to results-shipped/ first, so the re-run can be diffed against them.
set -e
cd "$(dirname "$0")"
HERE=$(pwd)

if [ ! -d results-shipped ]; then
  mkdir -p results-shipped
  cp -p audit_summary.json matcher_evaluation.json synchronicity.json synchronicity_per_file.json \
        gold_notes.json gold_titles.json candidates_gold.json candidates_test.json results-shipped/ 2>/dev/null || true
  echo "shipped outputs copied to results-shipped/ (keep them: they are the reference)"
fi

# The corpus (16 MB of JSONL + two API caches) lives outside git on purpose: this repo has no big-data convention and
# `cache/` is ignored. Point WIKIBENTO_AUDIT_DIR at it, or accept the default below.
DATA=${WIKIBENTO_AUDIT_DIR:-"$HOME/Documents/ai/wikibento-audit-data"}
[ -f "$DATA/files.jsonl" ] || { echo "no corpus at $DATA — set WIKIBENTO_AUDIT_DIR to the audit data directory" >&2; exit 1; }
cp -p "$DATA"/files.jsonl "$DATA"/api_cache*.json "$HERE"/ 2>/dev/null || true
./set_outdir.sh "$HERE" >/dev/null

echo "== 1/5 audit_report.py"; python3 audit_report.py >/dev/null
echo "== 2/5 crosscheck2.py";  python3 crosscheck2.py  >/dev/null
echo "== 3/5 select_gold.py";   python3 select_gold.py >/dev/null
echo "== 4/5 matcher.py --notes gold_notes.json --out candidates_gold.json"; python3 matcher.py --notes gold_notes.json --out candidates_gold.json >/dev/null
echo "== 5/5 evaluate.py gold_labels.json candidates_gold.json"; python3 evaluate.py gold_labels.json candidates_gold.json >/dev/null
echo
echo "== re-run vs shipped =="
for f in audit_summary.json matcher_evaluation.json synchronicity.json synchronicity_per_file.json gold_notes.json gold_titles.json candidates_gold.json; do
  if cmp -s "$f" "results-shipped/$f"; then echo "  identical : $f"; else echo "  DIFFERS   : $f"; fi
done
echo
echo "Note: synchronicity.json is EXPECTED to differ — the shipped copy was written 5 minutes before the last edit"
echo "to crosscheck2.py. Everything else should be byte-identical. The README explains it."
