# ToolFlow — Analysis

*Prepared 2026-08-15. An assessment of Magnus Manske's
[ToolFlow](https://toolflow.toolforge.org) and its relevance to WikiBento's
cross-widget dataflow / orchestration ambitions. Companion to
`MODULARITY-AND-DATAFLOW.md` (which argues orchestration is a different class of
app) — ToolFlow is the concrete, already-built proof of that argument.*

Source of record: <https://meta.wikimedia.org/wiki/ToolFlow>

---

## TL;DR

ToolFlow is **the most directly relevant prior art** for WikiBento's dataflow
ambitions: a Toolforge tool that chains existing Wikimedia tools (PetScan,
PagePile, Quarry, SPARQL) into workflows via a node graph, with operations
(filter/join), a generator (edit a wiki page), and a scheduler. It is the
**server-side orchestration endpoint** of the spectrum `MODULARITY-AND-DATAFLOW.md`
describes — and it is **complementary** to WikiBento, not competitive. The source
code is **still available** (two un-archived GitHub repos, dormant since 2023–24).

---

## What ToolFlow is

A workflow = a **flowchart of nodes** connected by edges, where the output of one
node is the input of the next. Node types:

| Category | Nodes | Role |
|---|---|---|
| **Adapter** (input from a tool) | PetScan, PagePile, Quarry (`QuarryQueryLatest`), SPARQL, WD-FIST, AListBuildingTool | Fetch from an external tool and map its output to a standardized format |
| **Operation** (transform) | Inner join on key, Join (merge by unique key), Filter | Combine or filter node outputs |
| **Generator** (output) | WikiPage | Render a data file as a wikitext table and edit a wiki page |

Additional mechanics:

- **Data format.** Every node produces a **JSONL** file (`jsonlines.org`): the
  first line is a JSON header defining the column schema; subsequent lines are
  JSON arrays/values per the columns. This "standardized internal format" is what
  makes operations (join/filter) tool-agnostic.
- **Output mapping.** Adapter nodes must map each tool's output to the standardized
  columns; ToolFlow suggests mappings where possible, with manual override.
- **Scheduler.** A workflow can have a daily/weekly/monthly schedule that clears
  prior files, re-runs the workflow, and — if a generator's wikitext changed —
  performs a wiki edit under your username.
- **Fork/remix.** Logged-in users can create workflows or fork existing ones; you
  edit and run only your own.

The web UI uses **Flowy** (a drag-and-drop flowchart JS library) + Vue.js.

---

## Source code status — still available

Both repos are live and un-archived (verified via GitHub API, 2026-08-15):

| Repo | What | Language | License | Last push |
|---|---|---|---|---|
| [magnusmanske/toolflow](https://github.com/magnusmanske/toolflow) | Web UI + API (`api.php`, `bot.php`, `toolflow.php`; `public_html/index.html`, `nodes.json`, Vue components, `flowy.min.js`) | HTML/PHP | GPL-3.0 | Oct 2023 |
| [magnusmanske/toolflow_rs](https://github.com/magnusmanske/toolflow_rs) | Background processing service | Rust | **none** ⚠️ | Aug 2024 |

**Licensing caveat:** `toolflow_rs` has **no license file** → "all rights
reserved"; read it for ideas, do **not** lift code. The web part is GPL-3.0
(copyleft). Both are dormant (~1 star each), typical of Manske's many niche tools.

### Rust source map (the interesting part)

| File | Role |
|---|---|
| `src/adapter.rs` | Adapter nodes — wrap external tools |
| `src/mapping.rs` | Output mapping (tool output → standardized columns) |
| `src/filter.rs` | Filter operation |
| `src/join.rs` | Inner-join / merge-by-key operations |
| `src/generator.rs` | Generator abstraction |
| `src/wiki_page.rs` | WikiPage generator (wikitext table + edit) |
| `src/data_header.rs` / `data_file.rs` / `data_cell.rs` | The JSONL standardized format |
| `src/workflow.rs` / `workflow_node.rs` / `workflow_run.rs` | Workflow engine (nodes, edges, runs) |
| `src/renderer.rs` | Output rendering |
| `test_data/*.jsonl` | Example data files |

---

## Why it matters for WikiBento — six concrete reasons

1. **It validates the "list source" idea** (`WIDGET-IDEAS.md`). ToolFlow's adapter
   nodes are *exactly* the list sources already sketched for WikiBento — PetScan,
   PagePile, Quarry, SPARQL. Manske already built the server-side version of "list
   as first-class input." Strong signal the direction is right.

2. **It is proof of the architectural boundary.** `MODULARITY-AND-DATAFLOW.md`
   argues orchestration needs a backend; ToolFlow is that argument made concrete —
   it required a **Rust service + PHP API + scheduler** for durability, scheduled
   re-runs, and wiki-edit auth. WikiBento stays client-side; ToolFlow shows what
   the server-side version looks like and *why* it needed a backend.

3. **The `adapter → operation → generator` taxonomy is a clean vocabulary.**
   WikiBento today has only "adapter" widgets (fetch-and-render). ToolFlow names
   the two natural extensions: **operations** (filter/join) and **generators**
   (output/edit) — a future "Filter widget", "Join widget", "Output widget" family.

4. **The JSONL standardized format generalizes WikiBento's `transform` contract.**
   ToolFlow normalizes every tool's output into a shared column-based JSONL so
   operations stay tool-agnostic. WikiBento's per-widget `transform` does the same
   *privately*; ToolFlow makes the normalized form *explicit and shared* — the right
   design if cross-widget dataflow ever ships.

5. **The output-mapping UX** (`mapping.rs`): auto-suggest a field mapping with
   manual override. A proven pattern for "how does a widget know which field is
   'the list'."

6. **Scheduler + WikiPage generator = "bot automation without writing a bot."**
   Run on a schedule, edit the wiki page if output changed — the generic, modern
   version of the Faebot/GLAM-dashboard pattern (bot-maintained reports → live).
   Directly relevant to WikiBento's GLAM reporting ambitions.

---

## Strategic take

ToolFlow and WikiBento are **complementary**:

- **ToolFlow** = server-side orchestration + scheduling + wiki-output ("run it and
  let it write the page").
- **WikiBento** = client-side interactive framing ("look at and explore this").

The bridge is the **shared list sources** (PetScan/PagePile/Quarry/SPARQL) and,
eventually, a WikiBento widget that *consumes a ToolFlow workflow's output*.

**Borrow:** the node taxonomy (adapter/operation/generator), the JSONL standardized
format, the output-mapping UX, and the list-source validation.

**Do not re-implement:** the Rust backend, scheduler, and wiki-edit auth — that is
exactly the "new class of app" line WikiBento should not cross while it stays
client-side.

---

*End of document — see `MODULARITY-AND-DATAFLOW.md` for the orchestration-vs-client
analysis this complements, and `TOOL-LANDSCAPE.md` for the broader tool survey.*
