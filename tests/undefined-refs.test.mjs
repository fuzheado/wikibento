import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A name that is exported somewhere in src/ and CALLED in a file that neither imports nor defines it.
 *
 * Why: `esbuild`/`vite` do not check undefined identifiers — a missing import is a runtime ReferenceError, not a build
 * error, so the whole test suite can be green while a card throws in the browser. That is exactly what happened on
 * 2026-09-18: `WidgetFrame` called `normalizeConfigForDef` with the import missing (a guard meant to add it was
 * satisfied by a comment), every unit test passed, and it threw only in `?lean=1` — the production bundle happened to
 * work because it flattened module scope, which is luck rather than correctness.
 *
 * The check is deliberately narrow (calls and JSX elements of names exported from src/) so its findings are real
 * findings: a name defined in the same file is local, and an import of any spelling counts as imported.
 */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(js|jsx)$/.test(e.name) ? [p] : [];
  });
}

const files = sourceFiles('src');
const sources = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// 1. every exported name, and where it comes from
const exported = new Map();
for (const [file, text] of sources) {
  const names = [];
  for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) names.push(m[1]);
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.push(name);
    }
  }
  for (const n of names) if (!exported.has(n)) exported.set(n, file);
}

test('a name exported from src/ is never CALLED without being imported or defined', () => {
  const problems = [];
  for (const [file, text] of sources) {
    // what this file imports (any spelling) and what it defines locally
    const imported = new Set([...text.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\}|\*\s+as\s+([\w$]+))?\s*from/g)]
      .flatMap((m) => [m[1], m[3], ...(m[2] || '').split(',').map((s) => s.split(/\s+as\s+/).pop().trim())])
      .filter(Boolean));
    const local = new Set([...text.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]));
    // Prose is not code: `widgetDef()` mentioned in a comment is not a call. (The first version of this check
    // flagged exactly that — a comment of mine in src/lib/gallerySource.js — which is the same failure mode it
    // exists to catch, one level up.)
    const code = text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    for (const [name, from] of exported) {
      if (from === file || imported.has(name) || local.has(name)) continue;
      // a call `name(` or a JSX element `<Name` — the two ways a component/helper is actually used
      const called = new RegExp(`(?<![\\w$.])${name}\\s*\\(`).test(code);
      const jsx = new RegExp(`<${name}[\\s/>]`).test(code);
      if (called || jsx) problems.push(`${file}: ${name}${called ? '()' : ''} (exported by ${from})`);
    }
  }
  assert.deepEqual(problems, [], `unimported references:\n  ${problems.join('\n  ')}`);
});
