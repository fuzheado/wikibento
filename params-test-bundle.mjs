// tests/params.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

// src/lib/params.js
function parseParams(block) {
  const specs = {};
  const values = {};
  if (!block || typeof block !== "object") return { specs, values };
  for (const [name, raw] of Object.entries(block)) {
    if (!raw || typeof raw !== "object") continue;
    const type = ["buttons", "select", "text"].includes(raw.type) ? raw.type : Array.isArray(raw.options) ? "select" : "text";
    const options = Array.isArray(raw.options) ? raw.options.map(String) : void 0;
    let value = raw.value !== void 0 ? String(raw.value) : options?.length ? options[0] : "";
    if (type === "text" && !value && typeof raw.value === "string") value = raw.value;
    specs[name] = { label: raw.label || name, type, options };
    values[name] = value;
  }
  return { specs, values };
}
var warned = /* @__PURE__ */ new Set();
function resolveParams(config, values) {
  if (!config || typeof config !== "object" || !values || typeof values !== "object") return config;
  let changed = false;
  const walk = (v) => {
    if (typeof v === "string") {
      const out = v.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (m, name) => {
        if (!(name in values)) {
          if (!warned.has(name)) {
            console.warn(`[params] no board param named "${name}" \u2014 leaving literal (${m})`);
            warned.add(name);
          }
          return m;
        }
        changed = true;
        return values[name];
      });
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val);
      return out;
    }
    return v;
  };
  const resolved = walk(config);
  return changed ? resolved : config;
}

// tests/params.test.mjs
test("parseParams: defaults to first option; explicit value wins", () => {
  const { specs, values } = parseParams({
    category: { label: "Museum", type: "buttons", options: ["A", "B"], value: "B" },
    year: { options: ["2023", "2024"] }
  });
  assert.equal(values.category, "B");
  assert.equal(values.year, "2023");
  assert.equal(specs.category.type, "buttons");
  assert.equal(specs.year.type, "select");
  assert.equal(specs.year.label, "year");
});
test("parseParams: text type, junk tolerated", () => {
  const { specs, values } = parseParams({ q: { type: "text", value: "Einstein" }, junk: "string", empty: null });
  assert.equal(values.q, "Einstein");
  assert.equal(specs.junk, void 0);
  assert.equal(specs.empty, void 0);
});
test("resolveParams: substitutes {{name}} in string fields, deep", () => {
  const values = { category: "Images from the Met" };
  assert.equal(
    resolveParams({ category: "{{category}}", title: "Photos of {{category}} (sample)" }, values).category,
    "Images from the Met"
  );
  assert.equal(
    resolveParams({ nested: { deep: ["{{category}}"] } }, values).nested.deep[0],
    "Images from the Met"
  );
});
test("resolveParams: numbers, booleans, and placeholder-free configs pass through untouched", () => {
  const cfg = { n: 6, flag: true, wiki: "commons.wikimedia" };
  assert.equal(resolveParams(cfg, { category: "X" }), cfg);
  const out = resolveParams({ n: "{{category}}" }, { category: "X" });
  assert.equal(typeof out.n, "string");
});
test("resolveParams: unknown names left LITERAL (never break a board)", () => {
  const cfg = { category: "{{nope}}" };
  assert.equal(resolveParams(cfg, { other: "X" }), cfg);
  assert.equal(resolveParams({ a: "{{nope}}", b: "{{yes}}" }, { yes: "Y" }).a, "{{nope}}");
  assert.equal(resolveParams({ a: "{{nope}}", b: "{{yes}}" }, { yes: "Y" }).b, "Y");
});
test("resolveParams: whitespace-tolerant placeholders", () => {
  assert.equal(resolveParams({ a: "{{ category }}" }, { category: "X" }).a, "X");
});
