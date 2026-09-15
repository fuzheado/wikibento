import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The `mul` constitution — Wikidata's language-neutral labels.
 *
 * Some items have **no `en` label at all**: Wikidata keeps names that are the same in every language
 * under the `mul` code and applies the reading fallback. `Q7186` (Marie Curie, 247 sitelinks, an
 * English *description*) returns `{mul: "Marie Curie"}` and nothing under `en`, so a label lookup that
 * asks only for the reader's language and `en` renders her as **"Q7186"** — which is what the app did,
 * in every entity-labelling widget, until 2026-09-14.
 *
 * | request | result |
 * |---|---|
 * | `wbgetentities&languages=en` | *(no label)* → `Q7186` |
 * | `wbgetentities&languages=en\|mul` | `Marie Curie` |
 * | WDQS `wikibase:language "en"` | `Q7186` |
 * | WDQS `wikibase:language "en,mul"` | `Marie Curie` |
 *
 * `wbsearchentities` is exempt, and that is measured rather than assumed: searching with
 * `language=en` (even `strictlanguage=1`) finds `Q7186` and returns "Marie Curie", because search
 * matches across languages and resolves the returned label with the fallback.
 *
 * These tests exist because the failure is silent and looks like data: a QID is a valid-looking cell,
 * no error is raised, and the affected widgets simply show "Q7186" instead of a person's name.
 */

const ROOT = process.cwd();

/** Every source/config file a label lookup could hide in (markdown is prose, not code). */
function sourceFiles(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) {
      if (!/node_modules|dist|\.git/.test(name)) sourceFiles(rel, out);
    } else if (/\.(js|jsx|json)$/.test(name)) {
      out.push(rel);
    }
  }
  return out;
}

/**
 * Strip comments before scanning. The trap itself is documented in code comments that quote the
 * FAILING form (`wikibase:language "en"`) as the illustration, and the constitution is about the
 * requests the app makes, not about the prose describing them. `//` is only treated as a comment
 * when it is not part of a URL (`http://…`), because every SPARQL preset carries PREFIX lines.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('every SPARQL label service asks for mul', () => {
  const files = [...sourceFiles('src'), ...sourceFiles('public')];
  const offenders = [];
  let services = 0;
  for (const f of files) {
    const text = stripComments(readFileSync(join(ROOT, f), 'utf8'));
    for (const m of text.matchAll(/wikibase:language\s*"([^"]*)"/g)) {
      services += 1;
      if (!/(^|,)\s*mul\s*(,|$)/.test(m[1])) offenders.push(`${f}: wikibase:language "${m[1]}"`);
    }
  }
  assert.ok(services >= 3, `expected the presets to carry label services, found ${services}`);
  assert.deepEqual(offenders, [], `these label services will render mul-only items as QIDs:\n  ${offenders.join('\n  ')}`);
});

test('the Action API label lookup asks for mul and reads it', () => {
  const src = readFileSync(join(ROOT, 'src/lib/sparqlLabels.js'), 'utf8');
  assert.match(src, /languages/, 'the request builds a languages parameter');
  assert.match(src, /\|mul|mul\|/, 'and it requests mul alongside the reader language and en');
  assert.match(src, /labels\.mul\?\.value/, 'and reads it as the last fallback');
});

test('label lookups go through the one helper that knows about mul', () => {
  // A new `props: 'labels'` call somewhere else would bypass the fallback silently.
  const files = sourceFiles('src');
  const offenders = [];
  for (const f of files) {
    if (f === 'src/lib/sparqlLabels.js') continue;
    const text = readFileSync(join(ROOT, f), 'utf8');
    if (/props:\s*'labels'|props=labels/.test(text)) offenders.push(f);
  }
  assert.deepEqual(offenders, [],
    `these files fetch Wikidata labels without the mul-aware helper (use buildLabelRequestUrl/parseLabelResponse): ${offenders.join(', ')}`);
});

test('wbsearchentities is exempt, and stays exempt', () => {
  // Measured 2026-09-14: search finds mul-only labels with language=en, even with strictlanguage=1.
  // If that ever changes, this test is the place to notice — it pins WHY the search path has no mul.
  const src = readFileSync(join(ROOT, 'src/lib/paramSources.js'), 'utf8');
  assert.match(src, /action:\s*'wbsearchentities'/, 'the lookup box still searches');
  assert.match(src, /language:\s*'en'/, 'and still searches in English (safe for mul-only items)');
});
