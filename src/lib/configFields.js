/**
 * What the ⚙ config panel should show for a field.
 *
 * A board stores a PRESET, not the preset's query: `config.query` is empty and the fetch path uses
 * `config.query || preset.query`. The panel used to render the stored value directly, so opening the
 * gear on any preset-backed SPARQL widget showed an EMPTY query box — the query that was actually
 * running was invisible, and the only way to see it was to pick the preset from the dropdown again.
 *
 * A field may declare `fallbackValue(config)` for the case where nothing is stored. A stored value
 * always wins, so a user's own edit is never hidden behind the fallback.
 */
export function configFieldValue(field, config) {
  const stored = config?.[field?.key];
  if (stored !== '' && stored != null) return stored;
  if (typeof field?.fallbackValue === 'function') {
    const fallback = field.fallbackValue(config);
    if (fallback != null) return fallback;
  }
  return stored ?? '';
}

  /**
   * Should the ⚙ panel show this field, given a field may declare `showIf: { otherKey: 'value' }`?
   *
   * The value is read the way the field itself reads it — the stored config first, then the registry default —
   * so a widget added with defaults shows the fields its defaults imply (fileGallery arrives as from:'list', so
   * its category fields stay hidden until you ask for them).
   */
  export function fieldVisible(field, config, defaults) {
    if (!field?.showIf) return true;
    return Object.entries(field.showIf).every(([key, want]) => {
      const raw = config?.[key];
      const val = raw === undefined || raw === '' ? (defaults?.[key] ?? '') : raw;
      return String(val) === String(want);
    });
  }
