import { useEffect, useMemo, useRef } from 'react';
import { spawnOptions, wireConfig } from '../lib/spawnOptions.js';
import { KIND_LABELS } from '../lib/pickMode.js';

/**
 * The spawn-from-a-card panel (ISSUE-96, design brief 2026-10-05, option A).
 *
 * Two sides, both answered by `spawnOptions(widgetType, config, registry)`:
 *   · LEFT  "Feed this card"       — what can PROVIDE a value this card consumes (`feeds`), grouped by the
 *                                    shape/subject the card wants; each row is a producer type.
 *   · RIGHT "Use this card's value" — what can CONSUME this card's output (`feedsTo`), grouped by channel;
 *                                    each row names the field it would write, so "wired" is not a mystery.
 * An empty side shows the human-readable `notes` line for that side rather than a blank list.
 *
 * Like PickMenu, this is a LEAF that imports only pure lib modules and takes the registry as a PROP
 * (`spawnOptions` itself takes it as a parameter). Importing the registry here — App imports both this
 * panel and the registry — would close the module-initialisation cycle that already cost a revert
 * (AGENTS.md, ISSUE-114).
 *
 * The choice is not acted on here: `onChoose({ side, type, kind, subject, field, channel })` hands it to
 * App, which creates the card through the ONE add path (`handleAddWidget`), pre-wired and placed adjacent.
 */

/** Group heading for a `feeds` group: the value form and the thing a subject-match is about, else the shape offered. */
function feedGroupLabel(group) {
  if (group.subject) return `Wants a ${group.denotes || 'value'} for ${KIND_LABELS[group.subject] || group.subject}`;
  return `Accepts ${group.kind}`;
}

/** Group heading for a `feedsTo` group: the channel the card publishes. */
function useGroupLabel(group) {
  return `Publishes ${group.channel}`;
}

/**
 * Place the panel near the card that opened it. The overlay flex-centres the panel (like every other
 * panel); this computes a translate offset so it sits under the card rather than in the middle of the
 * screen. Clamped to the viewport so a card at the bottom-edge does not push the panel off-screen.
 */
function anchorOffset(anchor) {
  if (!anchor || typeof window === 'undefined') return { x: 0, y: 0 };
  const halfW = window.innerWidth / 2;
  const x = Math.max(-halfW + 24, Math.min(halfW - 400, (anchor.left + anchor.width / 2) - halfW));
  const y = Math.max(-60, Math.min(window.innerHeight - 260, anchor.top - 80));
  return { x: Math.round(x), y: Math.round(y) };
}

export default function SpawnPanel({ widgetType, config = {}, registry = {}, anchor = null, onChoose, onClose }) {
  const ref = useRef(null);
  // `config` is the CARD'S OWN config (App passes the widget's live config) — `spawnOptions` reads it to decide
  // which of a multi-source card's fields it actually reads, so the panel never offers a feeder for a hidden field.
  const { feeds, feedsTo, notes } = useMemo(
    () => spawnOptions(widgetType, config, registry),
    [widgetType, config, registry],
  );
  // The definition, for the per-group "this would move the card's source" note below (pure lib, no cycle).
  const def = registry[widgetType];

  // Escape and an outside click close it — the same contract as PickMenu and the header popovers.
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

  // `spawnOptions` returns ONE notes array with the empty sides' sentences in order: the feed note is
  // pushed first, the feedsTo note last. Read them positionally rather than by fragile string matching.
  const feedNote = feeds.length === 0 ? notes[0] : null;
  const useNote = feedsTo.length === 0 ? notes[notes.length - 1] : null;

  const offset = anchorOffset(anchor);

  return (
    <div className="add-widget-overlay spawn-overlay" onClick={onClose}>
      <div
        className="add-widget-panel spawn-panel"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
        role="dialog"
        aria-modal="true"
        aria-label="Chain a neighbour card"
        data-spawn-for={widgetType}
      >
        <div className="add-widget-header">
          <h3>⇄ Chain a neighbour</h3>
          <button className="widget-btn widget-btn-remove" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="spawn-body">
          <section className="spawn-side spawn-side-left">
            <div className="spawn-side-head">
              <span className="spawn-dot spawn-dot-left" />
              Feed this card
              <span className="spawn-side-meta">what it consumes</span>
            </div>
            {feedNote && <p className="spawn-empty">{feedNote}</p>}
            {feeds.map((group) => {
              // A feeder that would move the card to a DIFFERENT source is a surprise the user is owed a line about:
              // `wireConfig` reports the move, and we show it under the group (ISSUE-96). Live fields are filtered,
              // so this normally stays empty — it is the honest escape hatch when one candidate implies a switch.
              // `denotes` travels with the group so the preview wires the SAME pair the menu offered (the third axis).
              const wire = def ? wireConfig(def, { fromId: '__spawn__', subject: group.subject, denotes: group.denotes, config }) : null;
              const move = wire && !wire.refused && wire.changedSource ? wire.reason : null;
              return (
              <div className="spawn-group" key={`feed-${group.kind}-${group.subject || ''}-${group.field || ''}`}>
                <div className="spawn-group-label" title={group.reason}>{feedGroupLabel(group)}</div>
                {move && <p className="spawn-group-move" title={move}>⚠️ {move}</p>}
                {group.types.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    className="spawn-item"
                    title={group.reason}
                    onClick={() => onChoose({ side: 'feed', type: t.type, kind: group.kind, subject: group.subject, denotes: group.denotes })}
                  >
                    <span className="spawn-item-icon">{t.icon}</span>
                    <span className="spawn-item-name">{t.name}</span>
                    <span className="spawn-item-why">→ {group.kind}</span>
                  </button>
                ))}
              </div>
              );
            })}
          </section>

          <section className="spawn-side spawn-side-right">
            <div className="spawn-side-head">
              <span className="spawn-dot spawn-dot-right" />
              Use this card's value
              <span className="spawn-side-meta">what it publishes</span>
            </div>
            {useNote && <p className="spawn-empty">{useNote}</p>}
            {feedsTo.map((group) => (
              <div className="spawn-group" key={`to-${group.channel}`}>
                <div className="spawn-group-label" title={group.reason}>{useGroupLabel(group)}</div>
                {group.types.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    className="spawn-item"
                    title={group.reason}
                    onClick={() => onChoose({ side: 'consume', type: t.type, channel: group.channel, field: t.field })}
                  >
                    <span className="spawn-item-icon">{t.icon}</span>
                    <span className="spawn-item-name">{t.name}</span>
                    <span className="spawn-item-why" title={`writes “${t.field}”`}>← {t.field}</span>
                  </button>
                ))}
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
