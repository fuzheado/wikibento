/**
 * Shared host-portability helpers for the tutorial pipeline.
 *
 * Every script in this directory used to carry its own copy of the output-directory rule, and three
 * of them had the recording host's `/opt/data/staging/...` baked in — which cannot even be created
 * on a laptop. One rule, resolved the same way by all of them:
 *
 *   --out <dir>  →  WIKIBENTO_TUTORIAL_OUT  →  the staging path *if that host has it*  →  temp dir
 *
 * The same "check the platform default, don't demand an env var" idea as the Playwright ffmpeg
 * cache below: being wrong about where something lives should produce a clear message, not a
 * mysterious failure.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

/** The recording host's staging area. Only used when it actually exists. */
export const STAGING = '/opt/data/staging';

/** `--name value` from argv, else the default. */
export function arg(name, dflt) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
}

/**
 * Resolve the pipeline's working directory.
 * @param {string|null} explicit  value of --out, if passed
 * @param {{sub?: string, env?: string}} [opts]
 */
export function resolveOut(explicit, { sub = 'wikibento-tutorial', env = 'WIKIBENTO_TUTORIAL_OUT' } = {}) {
  if (explicit) return explicit;
  if (process.env[env]) return process.env[env];
  if (existsSync(STAGING)) return join(STAGING, sub);
  return join(tmpdir(), sub);
}

/**
 * The Playwright browser cache that contains an `ffmpeg-<rev>/` directory — Playwright's own
 * recording ffmpeg, which `recordVideo` requires and the system ffmpeg cannot replace.
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
