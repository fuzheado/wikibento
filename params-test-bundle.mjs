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
    const type = ["buttons", "select", "text", "number", "month"].includes(raw.type) ? raw.type : Array.isArray(raw.options) ? "select" : "text";
    const options = Array.isArray(raw.options) ? raw.options.map(String) : void 0;
    let value = raw.value !== void 0 ? String(raw.value) : type === "month" ? "0" : options?.length ? options[0] : "";
    if (type === "text" && !value && typeof raw.value === "string") value = raw.value;
    specs[name] = { label: raw.label || name, type, options };
    values[name] = value;
  }
  return { specs, values };
}
var warned = /* @__PURE__ */ new Set();
function parseParamSpecText(text) {
  const block = {};
  const TYPES = ["buttons", "select", "text", "number", "month"];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parts = t.split("|").map((s) => s.trim());
    const name = parts[0];
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) continue;
    let type, label, options;
    if (parts.length >= 4) {
      [type, label, options] = [parts[1], parts[2], parts[3]];
    } else if (parts.length === 3) {
      if (TYPES.includes(parts[1])) {
        [type, label] = [parts[1], parts[2]];
      } else {
        [options, label] = [parts[1], parts[2]];
      }
    } else if (parts.length === 2) {
      if (TYPES.includes(parts[1])) type = parts[1];
      else options = parts[1];
    }
    const entry = { label: label || name };
    if (TYPES.includes(type)) entry.type = type;
    if (options !== void 0 && options !== "") {
      entry.options = options.split(",").map((s) => s.trim()).filter(Boolean);
      if (!entry.type) entry.type = "select";
    }
    block[name] = entry;
  }
  return block;
}
function paramSpecToText(block) {
  return Object.entries(block || {}).map(([name, p]) => {
    const type = p.type || (p.options ? "select" : "text");
    const opts = (p.options || []).join(", ");
    return [name, type, p.label || name, opts].filter((v, i) => i < 3 || v).join(" | ");
  }).join("\n");
}
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
test("parseParamSpecText: full line format \u2192 block", () => {
  const block = parseParamSpecText(
    "category | buttons | Collection | Smithsonian, Rijksmuseum\nyear | select | Year | 2023, 2024\nquery | text | Search"
  );
  assert.deepEqual(block.category, { label: "Collection", type: "buttons", options: ["Smithsonian", "Rijksmuseum"] });
  assert.deepEqual(block.year, { label: "Year", type: "select", options: ["2023", "2024"] });
  assert.deepEqual(block.query, { label: "Search", type: "text" });
});
test("parseParamSpecText: junk tolerated (bad names skipped, comments, blank lines)", () => {
  const block = parseParamSpecText("# a comment\n\nok | text | Ok\nbad name!! | text | X");
  assert.deepEqual(Object.keys(block), ["ok"]);
});
test("parseParamSpecText: options without type default to select", () => {
  const block = parseParamSpecText("size | Small, Large");
  assert.equal(block.size.type, "select");
  assert.deepEqual(block.size.options, ["Small", "Large"]);
});
test("paramSpecToText roundtrips through parseParamSpecText", () => {
  const block = { category: { label: "Collection", type: "buttons", options: ["A", "B"] }, q: { label: "Search", type: "text" } };
  const text = paramSpecToText(block);
  const back = parseParamSpecText(text);
  assert.deepEqual(back, block);
});
test("number params: options = [min, max, step]; value defaults to min", () => {
  const { specs, values } = parseParams({ count: { type: "number", label: "Photos", options: [3, 12, 1] } });
  assert.equal(values.count, "3");
  assert.deepEqual(specs.count.options, ["3", "12", "1"]);
});
test("month params: default value 0 (latest available)", () => {
  const { values } = parseParams({ month: { type: "month", label: "Data month" } });
  assert.equal(values.month, "0");
  const { values: v2 } = parseParams({ month: { type: "month", value: 7 } });
  assert.equal(v2.month, "7");
});
test("spec text: number form parses min,max,step; month form parses bare", () => {
  const block = parseParamSpecText("count | number | Photos | 3, 12, 1\nmonth | month | Data month");
  assert.deepEqual(block.count.options, ["3", "12", "1"]);
  assert.equal(block.count.type, "number");
  assert.equal(block.month.type, "month");
  assert.equal(block.month.options, void 0);
});
