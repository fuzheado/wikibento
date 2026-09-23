/**
 * What the ⚙ config panel should show for a field.
 *
 * A board stores a PRESET, not the preset's query: `config.query` is empty and the fetch path uses
 * `config.query || preset.query`. The panel used to render the stored value directly, so opening the
 * gear on any preset-backed SPARQL widget showed an EMPTY query box — the query that was actually
 * running was invisible, and the only way to see it was to pick the preset from the dropdown again.
 *
 * A field may declare `fallbackValue(config, extra)` for the case where nothing is stored. A stored value
 * always wins, so a user's own edit is never hidden behind the fallback. `extra` carries board context.
 */
export function configFieldValue(field, config, defaults, extra) {
  const stored = config?.[field?.key];
  if (stored !== '' && stored != null) return stored;
  // A field-specific fallback next: it can be richer than a constant, and it may read `extra` — board context such
  // as `paramSpecs`, which is how the Board Controls spec box shows the params actually driving the board instead of
  // an empty textarea (2026-09-18).
  if (typeof field?.fallbackValue === 'function') {
    const fallback = field.fallbackValue(config, extra);
    if (fallback != null && fallback !== '') return fallback;
  }
  // Then the REGISTRY DEFAULT, because that is what the card is rendering. Without this, every field left at its
  // default showed an empty box while the card showed the default's value — the same "rendered vs input" bug as the
  // preset case above, and not hypothetical: a boolean whose default is `true` rendered checked with an unchecked
  // box. A field whose box is empty while the card shows data is a lie about the state of the widget.
  if (defaults && defaults[field?.key] !== undefined) return defaults[field.key];
  return stored ?? '';
}

  /**
   * Should the ⚙ panel show this field, given a field may declare `showIf: { otherKey: 'value' }`
   * (or `{ otherKey: ['a', 'b'] }` for a field that belongs to several sources)?
   *
   * The value is read the way the field itself reads it — the stored config first, then the registry default —
   * so a widget added with defaults shows the fields its defaults imply (a gallery arrives as from:'list', so
   * its category fields stay hidden until you ask for them).
   */
  export function fieldVisible(field, config, defaults) {
    if (!field?.showIf) return true;
    return Object.entries(field.showIf).every(([key, want]) => {
      const raw = config?.[key];
      const val = raw === undefined || raw === '' ? (defaults?.[key] ?? '') : raw;
      // `want` may be a value or a list of values — a field shared by several sources, like `project`.
      return (Array.isArray(want) ? want : [want]).some((w) => String(val) === String(w));
    });
  }
