/**
 * The project picker (ISSUE-93) — every wiki, ordered by what this user actually uses, searchable by anything.
 *
 * Lives in its own module because two places need it: a widget's ⚙ panel (any card that names a wiki) and the
 * Settings panel (the default wiki, and the recently-used list). A `<datalist>` was the tempting shortcut and it
 * does not work — the browser matches on the *value* (`de.wikipedia`), so typing "German" finds nothing, and a list
 * of 364 is exactly where that matters. So this is a small combobox: type a label, a dbname, a language or a
 * script, see the ranked matches, pick one.
 *
 * What it stores is the dotted form the app has always used (`en.wikipedia`), so no board changes meaning; what it
 * shows is the label ("German Wikipedia (Deutsch)"). A pick is remembered, which is what makes the second visit
 * fast.
 */

import { useState } from 'react';

import {
  orderProjects, filterProjects, labelFor, readRecentProjects, noteRecentProject,
  readDefaultProject, toFieldValue,
} from '../lib/projects';

/** The shortlist a picker shows before (or instead of) the site matrix — never an empty dropdown. */
const FALLBACK_PROJECTS = [
  { dbname: 'enwiki', label: 'English Wikipedia', config: 'en.wikipedia', lang: 'en', langName: 'English', family: 'wikipedia' },
  { dbname: 'dewiki', label: 'Deutsch Wikipedia', config: 'de.wikipedia', lang: 'de', langName: 'Deutsch', family: 'wikipedia' },
  { dbname: 'frwiki', label: 'Français Wikipedia', config: 'fr.wikipedia', lang: 'fr', langName: 'Français', family: 'wikipedia' },
  { dbname: 'eswiki', label: 'Español Wikipedia', config: 'es.wikipedia', lang: 'es', langName: 'Español', family: 'wikipedia' },
  { dbname: 'commonswiki', label: 'Wikimedia Commons', config: 'commons.wikimedia', lang: null, langName: null, family: 'commons' },
  { dbname: 'wikidata', label: 'Wikidata', config: 'www.wikidata', lang: null, langName: null, family: 'wikidata' },
  { dbname: 'enwikisource', label: 'English Wikisource', config: 'en.wikisource', lang: 'en', langName: 'English', family: 'wikisource' },
];

/**
 * The project picker (ISSUE-93) — every wiki, ordered by what this user actually uses, searchable by anything.
 *
 * A `<datalist>` was the tempting shortcut and it does not work: the browser matches on the *value*
 * (`de.wikipedia`), so typing "German" finds nothing — and a list of 364 is exactly where that matters. So this is
 * a small combobox: type a label, a dbname, a language or a script, see the ranked matches, pick one.
 *
 * What it stores is the dotted form the app has always used (`en.wikipedia`), so no board changes meaning; what it
 * shows is the label ("German Wikipedia"). A pick is remembered, and that is what makes the second visit fast.
 */
export default function ProjectField({ field, value, projects, onChange }) {
  const mode = field.mode === 'language' ? 'language' : 'project';
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const [query, setQuery] = useState(null);
  const [recent, setRecent] = useState(() => readRecentProjects(store));
  const ranked = orderProjects(projects, { recent, defaultProject: readDefaultProject(store), mode });
  // A field may carry choices that are not projects at all — the Commons Impact Metrics widgets accept
  // "all wikis" — so they are offered first, exactly as the registry declares them.
  const all = [...(field.extras || []).map((e) => ({ ...e, dbname: e.value, config: e.value, extra: true })), ...ranked];
  const matches = filterProjects(all, query || '', { mode }).slice(0, 40);
  const currentLabel = labelFor(projects, value, { mode });
  const disabled = !projects || !projects.length;

  const commit = (project) => {
    if (project.extra) { onChange(project.value); setQuery(null); return; }
    const next = toFieldValue(project, { mode });
    onChange(next);
    setRecent(noteRecentProject(store, mode === 'language' ? next : project.dbname));
    setQuery(null);
  };

  return (
    <div className="config-project-wrap">
      <input
        className="config-project-input"
        value={query === null ? currentLabel : query}
        disabled={disabled}
        placeholder={disabled ? 'loading the project list…' : (field.placeholder || 'en.wikipedia')}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setQuery('')}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches.length) { e.preventDefault(); commit(matches[0]); }
          if (e.key === 'Escape') setQuery(null);
        }}
      />
      {query !== null && matches.length > 0 && (
        <ul className="config-project-list" role="listbox">
          {matches.map((p) => (
            <li key={p.dbname}>
              <button type="button" role="option" aria-selected={value === (mode === 'language' ? p.lang : p.config)}
                onMouseDown={(e) => e.preventDefault()} onClick={() => commit(p)}>
                <span className="config-project-item-label">{mode === 'language' ? (p.langName || p.label) : p.label}</span>
                <span className="config-project-item-id">{mode === 'language' ? p.lang : p.config}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query !== null && matches.length === 0 && <div className="config-hint">No project matches “{query}”.</div>}
      {field.hint && <small className="config-hint">{field.hint}</small>}
    </div>
  );
}

export { FALLBACK_PROJECTS };
