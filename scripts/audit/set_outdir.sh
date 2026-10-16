#!/bin/sh
# Point the audit scripts at a directory of your choosing instead of the hard-coded /opt/data/audit.
# Usage: ./set_outdir.sh [directory]      (default: this script's own directory)
#
# Rewritten portably: the original used GNU `sed -i "s|…|…|"`, which fails on macOS/BSD (`sed -i` needs an extension
# argument there). This does the same edit in Python, which the package already requires.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
DIR=${1:-$HERE}
[ -d "$DIR" ] || { echo "not a directory: $DIR" >&2; exit 1; }
cd "$HERE"
python3 - "$DIR" <<'PY'
import glob, os, sys
d = sys.argv[1]
for f in glob.glob('*.py'):
    s = open(f).read()
    for line in s.split('\n'):
        if line.startswith('OUTDIR = '):
            s = s.replace(line, f'OUTDIR = {d!r}')
            open(f, 'w').write(s)
            print(f'  {f}: OUTDIR = {d}')
            break
PY
