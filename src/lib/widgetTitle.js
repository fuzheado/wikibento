/**
 * What a card's title bar says — decided in one place, so it can be tested rather than inferred from a ternary.
 *
 * Three sources, in this order:
 *
 *   1. **`_title`** — the user's own rename (ISSUE-53). It wins outright; a card the reader named stays named.
 *   2. **`labelFromData(data)`** — what the widget *resolved*, when it declares how to read that from its fetched
 *      data. This exists because some subjects cannot be named from the config: a Map is given `Q64`, and only the
 *      fetch knows that means "Berlin" (ISSUE-131's open edge). Until data arrives this returns nothing and the next
 *      source answers, so the header reads `Q64` while loading and "Berlin" once it is true.
 *   3. **`labelFromConfig(config)`** — the asset being analyzed (article, category, file, domain, language), which
 *      most widgets can name without fetching anything.
 *
 * Falling back to the generic widget name (or, last, the widget's type id) keeps a card that names nothing from
 * rendering an empty title bar. `labelFromData` is opt-in per widget type, so a widget that sets `data.title` for its
 * own content does not silently rename its header.
 */

export function widgetTitle({ def, config, data, fallback } = {}) {
  const custom = config?._title;
  if (custom && custom !== def?.name) return custom;
  return def?.labelFromData?.(data) || def?.labelFromConfig?.(config) || def?.name || fallback || 'widget';
}
