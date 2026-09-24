import { useEffect, useRef } from 'react';
import { brushableTypes, KIND_LABELS } from '../lib/pickMode.js';

/**
 * The brush's type menu (ISSUE-114 slice 2) — choose a widget type once, then click items in the cards you are
 * already reading; every click places a card of that type for that item. The mode persists across clicks, which is
 * the whole point: six excerpts from one list of links is six clicks and no dialog.
 *
 * This component imports ONLY from `lib/pickMode.js` and takes the registry as a prop. That is not tidiness — the
 * first attempt imported the registry itself and, because `App` imports both this menu and the registry, it formed a
 * module-initialisation cycle: the built bundle threw `Cannot access 'Re' before initialization`, while the tests,
 * `node --check` and `vite build` all passed. A leaf that receives its data cannot close a cycle. (See ISSUE-114;
 * `npm run smoke:built` is the check that sees this class of failure.)
 */
export default function PickMenu({ registry, brush, onPick, onClose }) {
  const ref = useRef(null);

  // Dismiss on a click outside or Escape — the same contract as the other header popovers.
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Group by what the type consumes, so the menu reads as the vocabulary: Articles, Commons files, …
  const groups = new Map();
  for (const t of brushableTypes(registry)) {
    for (const kind of t.kinds) {
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push(t);
    }
  }

  return (
    <div className="pick-menu" ref={ref}>
      <div className="pick-menu-head">
        <b>🖌 Pick mode</b>
        <span>Choose a type, then click items in your cards — each click places one.</span>
      </div>
      {brush && (
        <button className="pick-menu-item pick-menu-off" onClick={() => onPick(null)}>
          <span className="pick-menu-icon">✕</span> Stop picking
        </button>
      )}
      {[...groups.entries()].map(([kind, list]) => (
        <div key={kind} className="pick-menu-group">
          <div className="pick-menu-group-label">{KIND_LABELS[kind] || kind}</div>
          {list.map(({ type, def }) => (
            <button
              key={type}
              className={`pick-menu-item${brush === type ? ' active' : ''}`}
              onClick={() => onPick(type)}
              title={def.description || def.name}
            >
              <span className="pick-menu-icon">{def.icon || '▫'}</span>
              {def.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
