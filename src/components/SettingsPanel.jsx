/**
 * Settings (ISSUE-95) — the few preferences that belong to the *person*, not to a board.
 *
 * Deliberately small, and deliberately not a place to put board options. Three things live here, and each one
 * earns its place by having existed nowhere before, or only in a constant somewhere in the source:
 *
 *   1. **My wiki** — the default project the picker puts second (after your recent ones), so the common case is
 *      zero searching. The preference already existed for the picker to honour; this is the UI it never had.
 *   2. **Recently used wikis** — visible, and clearable. A recency list you cannot see is a list you cannot fix.
 *   3. **Present mode** — whether entering Present also asks the browser for fullscreen. That was a constant in
 *      `App.jsx` (`FULLSCREEN_ON_PRESENT`), which is a preference wearing a constant's clothes.
 *
 * Everything is stored under `wikibento-*` keys in localStorage, next to the board, because there is no account and
 * no server: a setting that cannot be inspected in devtools would be a setting nobody can debug.
 */

import { useState } from 'react';

import { readRecentProjects, noteRecentProject, readDefaultProject, writeDefaultProject } from '../lib/projects';
import ProjectField, { FALLBACK_PROJECTS } from './ProjectField';

/** Whether Present should ask for fullscreen. Default true, which is what the constant did. */
export const FULLSCREEN_KEY = 'wikibento-present-fullscreen';

export function readFullscreenPreference(storage) {
  try {
    const v = storage && storage.getItem ? storage.getItem(FULLSCREEN_KEY) : null;
    return v === null ? true : v === 'true';
  } catch { return true; }
}

export function writeFullscreenPreference(storage, value) {
  try { if (storage && storage.setItem) storage.setItem(FULLSCREEN_KEY, value ? 'true' : 'false'); } catch { /* ignore */ }
  return Boolean(value);
}

export default function SettingsPanel({ projects, onClose, onProjectsChanged }) {
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const [defaultProject, setDefaultProject] = useState(() => readDefaultProject(store) || '');
  const [recent, setRecent] = useState(() => readRecentProjects(store));
  const [fullscreen, setFullscreen] = useState(() => readFullscreenPreference(store));

  const chooseDefault = (dbname) => {
    writeDefaultProject(store, dbname || '');
    // The default is also a use of that wiki, so it joins the recents — the same rule the picker follows.
    if (dbname) setRecent(noteRecentProject(store, dbname));
    setDefaultProject(dbname || '');
    onProjectsChanged?.();
  };

  const clearRecents = () => {
    setRecent(noteRecentProject(store, '', { cap: 0 }) || []);
    onProjectsChanged?.();
  };

  const toggleFullscreen = () => {
    const next = !fullscreen;
    writeFullscreenPreference(store, next);
    setFullscreen(next);
  };

  return (
    <div className="add-widget-overlay" onClick={onClose}>
      <div className="add-widget-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="add-widget-header">
          <h2>⚙ Settings</h2>
          <button className="widget-btn" onClick={onClose} title="Close (Esc)">✕</button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>My wiki</h3>
            <p className="settings-note">
              The one you reach for most. The project picker offers your recent wikis first, then this one — so the
              common case needs no searching. Leave it empty for none.
            </p>
            <ProjectField
              field={{ key: 'defaultProject', label: 'Default wiki', placeholder: 'en.wikipedia' }}
              value={defaultProject}
              projects={projects}
              onChange={chooseDefault}
            />
            {defaultProject && (
              <button className="settings-clear" onClick={() => chooseDefault('')}>Clear my wiki</button>
            )}
          </section>

          <section className="settings-section">
            <h3>Recently used wikis</h3>
            {recent.length ? (
              <>
                <ul className="settings-list">
                  {recent.map((dbname) => (
                    <li key={dbname}>
                      <code>{dbname}</code>
                      {dbname === defaultProject && <span className="settings-tag">default</span>}
                      <button className="settings-mini" onClick={() => chooseDefault(dbname)}>Make default</button>
                    </li>
                  ))}
                </ul>
                <button className="settings-clear" onClick={clearRecents}>Clear the list</button>
              </>
            ) : (
              <p className="settings-note">
                Nothing yet — the picker records a wiki when you choose one, and this is where you can see and clear
                that list.
              </p>
            )}
          </section>

          <section className="settings-section">
            <h3>Present mode</h3>
            <label className="settings-toggle">
              <input type="checkbox" checked={fullscreen} onChange={toggleFullscreen} />
              <span>Ask for fullscreen when entering Present</span>
            </label>
            <p className="settings-note">
              Present always hides the editing controls; this only decides whether the browser is also asked to go
              fullscreen. Lean mode never asks.
            </p>
          </section>

          <section className="settings-section">
            <h3>About these settings</h3>
            <p className="settings-note">
              Stored in this browser (<code>localStorage</code>), next to your board — there is no account and no
              server, so nothing here follows you to another machine.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
