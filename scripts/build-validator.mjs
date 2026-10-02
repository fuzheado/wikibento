#!/usr/bin/env node
/**
 * Build the validator bundle — `deploy/validator-bundle.mjs`, what `/api/validate` imports.
 *
 * Why a bundle at all: the tool ships `server.js` and `dist/`, not `src/`. The alternative was a second, hand-written
 * validator inside the server, which is the class of duplication this project keeps paying for (the relay-type list
 * existed in three places until 2026-10-02; the ask validators in `server.js` are already a copy of the app's rules).
 * So the service runs the app's own code, built from the same source, and `defaults`/`showIf`/`outputs`/`primary` come
 * along because they live in the registry it reads.
 *
 * Usage:
 *   npm run build:validator            # write deploy/validator-bundle.mjs
 *   node scripts/build-validator.mjs --check   # fail if it is missing or older than src/ (what a deploy needs)
 *
 * The bundle is a BUILD ARTEFACT and is not committed (`.gitignore`), like `dist/`. A deploy therefore copies two files:
 * `server.js` and `validator-bundle.mjs`. `--check` is the guard against shipping a stale one, because a stale bundle
 * here means the endpoint answers with rules the app no longer has — the same trap `dist/` taught this repository.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'deploy', 'validator-bundle.mjs');
const CHECK = process.argv.includes('--check');

const newest = (dir) => {
  let ms = 0;
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    ms = Math.max(ms, statSync(join(entry.parentPath || entry.path || join(root, dir), entry.name)).mtimeMs);
  }
  return ms;
};

if (CHECK) {
  if (!existsSync(OUT)) {
    console.error('✘ deploy/validator-bundle.mjs is missing — run `npm run build:validator` before deploying');
    process.exit(1);
  }
  const srcTime = newest('src');
  const outTime = statSync(OUT).mtimeMs;
  if (srcTime > outTime) {
    console.error(`✘ deploy/validator-bundle.mjs is ${Math.round((srcTime - outTime) / 1000)}s older than src/ — the`
      + ' endpoint would answer with rules the app no longer has. Run `npm run build:validator`.');
    process.exit(1);
  }
  console.log('✔ validator bundle is present and newer than src/');
  process.exit(0);
}

const esbuild = join(root, 'node_modules', '.bin', 'esbuild');
const ARGS = ['scripts/validator-entry.js', '--bundle', '--platform=node', '--format=esm', `--outfile=${OUT}`, '--log-level=error'];
if (existsSync(esbuild)) execFileSync(esbuild, ARGS, { cwd: root, stdio: 'inherit' });
else execFileSync('npx', ['esbuild', ...ARGS], { cwd: root, stdio: 'inherit' });

const bytes = readFileSync(OUT);
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
console.log(`✔ deploy/validator-bundle.mjs — ${(bytes.length / 1024).toFixed(0)} KB · sha256:${hash}`);
console.log('  deploy note: this file is NOT part of dist/ — copy it beside server.js (deploy/README or HANDOFF → Deploying)');
