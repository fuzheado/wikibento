/**
 * Shared host-portability helpers for the video pipeline — and the config loader that tells every engine
 * script which project it is working on.
 *
 * `pipeline/` is the engine: beats, voiceover, overlays, encoding, review bundles. It knows nothing about
 * the app being demonstrated. Everything app-specific — the app's URL, its starting states, the actions
 * each scene performs, the text on the title and closing cards — lives in a **config module** the app owns
 * (here: `video/demo.config.mjs`). Every engine script is invoked with `--config <path>` (or the env var
 * `DEMO_VIDEO_CONFIG`), and defaults to `video/demo.config.mjs`.
 *
 * Output-directory rule, resolved the same way by all of them:
 *   --out <dir>  →  $DEMO_VIDEO_OUT  →  the staging path *if that host has it*  →  temp dir
 *
 * The same "check the platform default, don't demand an env var" idea as the Playwright ffmpeg cache
 * below: being wrong about where something lives should produce a clear message, not a mystery.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** The recording host's staging area. Only used when it actually exists. */
export const STAGING = '/opt/data/staging';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** `--name value` from argv, else the default. */
export function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
}

/**
 * Load the project config. A module exporting a default object; see pipeline/README.md for the contract.
 * @returns {Promise<object>} the config, with `name` and `__path` filled in
 */
export async function loadConfig(flagValue = null) {
  const rel = flagValue || process.env.DEMO_VIDEO_CONFIG || 'video/demo.config.mjs';
  const abs = isAbsolute(rel) ? rel : resolve(repoRoot, rel);
  if (!existsSync(abs)) {
    console.error(
      `✘ no video project config at ${abs}\n` +
      `  pass one with --config <path> (or set DEMO_VIDEO_CONFIG). The config names the app, its script,\n` +
      `  its starting states and its actions; see pipeline/README.md.`);
    process.exit(2);
  }
  const mod = await import(pathToFileURL(abs).href);
  const cfg = mod.default || mod.config;
  if (!cfg || typeof cfg !== 'object') {
    console.error(`✘ ${abs} must export a default config object`);
    process.exit(2);
  }
  cfg.__path = abs;
  cfg.dir = dirname(abs);
  cfg.name = cfg.name || 'demo-video';
  return cfg;
}

/** resolve a path from the config relative to the repo root (configs stay portable) */
export const cfgPath = (cfg, p) => (isAbsolute(p) ? p : resolve(repoRoot, p));

/**
 * Resolve the pipeline's working directory.
 * @param {string|null} explicit  value of --out, if passed
 * @param {object} cfg            the loaded config (for its name)
 */
export function resolveOut(explicit, cfg = { name: 'demo-video' }) {
  if (explicit) return explicit;
  if (process.env.DEMO_VIDEO_OUT) return process.env.DEMO_VIDEO_OUT;
  if (existsSync(STAGING)) return join(STAGING, cfg.name);
  return join(tmpdir(), cfg.name);
}

/**
 * The Playwright browser cache that contains an `ffmpeg-<rev>/` directory — Playwright's own recording
 * ffmpeg, which `recordVideo` requires and the system ffmpeg cannot replace.
 * Returns null when no candidate has one (the caller prints what it looked for).
 */
export function playwrightCacheWithFfmpeg() {
  const candidates = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    join(homedir(), 'Library', 'Caches', 'ms-playwright'), // macOS
    join(homedir(), '.cache', 'ms-playwright'),            // Linux/XDG
    join(homedir(), 'AppData', 'Local', 'ms-playwright'),  // Windows
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      if (readdirSync(dir).some((d) => d.startsWith('ffmpeg-'))) return dir;
    } catch { /* not this one */ }
  }
  return null;
}
