# The MCP endpoint — WikiBento as tools an agent can call

**Live:** `POST https://wikibento.toolforge.org/mcp` · **Check it:** `npm run smoke:mcp` (16 assertions, in `npm test`)

Why this exists. The Ask door (`docs/ASK-ARCHITECTURE.md`) was built for the case where a *person* carries a board
between a chat and the app — read `/board-guide.md`, write JSON, paste it into ⬆ Import. That works, and the app's
validator is served so the chat can check its own work (`/api/validate`). What it still needs is a human doing the
carrying. **MCP removes the human from that loop**: an agent with this server connected can read the contract, write a
board, validate it, and hand back a link — without anyone copying JSON between windows.

## What it is (and is not)

It is **JSON-RPC 2.0 over Streamable HTTP**: one `POST` in, one `application/json` response out. **Stateless** — no
session id, no server-sent events — which is also what makes it safe to run here: whether Toolforge's ingress buffers a
long-lived stream is not answerable from this repository, so the design asks nothing of it. `GET` and `DELETE` answer
**405**, which the spec allows for a server with no stream and no session to terminate.

It is **authless**, by decision (Andrew, 2026-10-02). The four tools are read-only over public data — a catalog, a
document, a validator and an encoder — so a token would protect nothing and would stop a reader connecting Claude in one
step. "No auth" is not "no bounds": the endpoint carries the same controls as every other route on this server (a
per-client allowance with a global hourly ceiling, a 256 KB body cap, a deadline-free read path because nothing is
fetched) and validates `Origin`, which the spec requires — that check is about DNS rebinding, not authentication.

It deliberately does **not** write, and it does not re-implement anything: `validate_board` runs the app's own
validator (bundled by `npm run build:validator`), and `make_board_url` runs the app's own share codecs. A second
implementation inside the server is the duplication this repository keeps paying for.

## The four tools

| tool | takes | returns |
|---|---|---|
| `get_catalog` | — | `public/manifest.json`: every widget type with its config fields, defaults, gates, and what it publishes (68 KB — prefer the guide's §2 when you only need field names) |
| `get_board_guide` | `section?` (`0`…`6`, or `envelope`, `catalog`, `gates`, `chains`, `references`, `checking`; default `all`) | the served contract, whole or by section — §1 (the envelope) is 2.4 KB and is the part a first-time caller needs |
| `validate_board` | `board` (object or JSON text) | the same verdict ⬆ Import gives: errors, repairs, warnings, notes, each naming the rule's section. A board it calls `unusable` is still a *successful diagnosis* — read the verdict, fix, call again |
| `make_board_url` | `board` (object or JSON text) | the board's JSON, a `#/d/` share URL, a `#/z/` compressed URL, and whether that fits a QR code (the ceiling is 1,500 characters, and it says so when it does not). It **refuses a board that cannot import**, rather than producing a link that shows the failure |

`initialize` also returns an `instructions` field — 499 characters, deliberately under the 512 that ChatGPT reads and
nothing after — which names the four tools and the order that works: guide → write → validate → link.

## Connecting a client

**Claude** (Pro/Max/Team/Enterprise, and free with one connector): *Customize → Connectors → Add custom connector*, URL
`https://wikibento.toolforge.org/mcp`. No authentication. Claude connects from its own servers, so the public URL is all
it needs.

**ChatGPT**: developer mode → *create an app* for a remote MCP server, with the same URL and "No authentication".
ChatGPT's read/fetch tier is enough — every tool here is read-only — and doing this needs a paid plan (write actions
require Business/Enterprise/Edu, which this server never asks for).

Any other MCP client: POST JSON-RPC to `/mcp`. `npm run smoke:mcp` shows the exact payloads a client sends, including
the two that must fail (an unknown method, an unknown tool) and the two transport refusals (a `GET`, a foreign
`Origin`).

## What an agent should do with it

```
get_board_guide            → read §1 (the envelope) and §2 (the catalog)
   ↓  write the board
validate_board             → errors? fix and call again. repairs are fine; warnings are worth reading
   ↓  only when the verdict is clean or importable
make_board_url             → hand the reader a link
```

That is the loop the door was built for, with the plumbing taken out. The measurements behind it — why the catalog alone
is not enough (93% right widgets, 0% usable envelopes), and what the app's validator accepts — are in
[ASK-ARCHITECTURE.md](ASK-ARCHITECTURE.md).

## Keeping it honest

- `npm run smoke:mcp` — the protocol as a client sees it (16 checks: the handshake, revision negotiation, a
  notification's 202, the tool list and schemas, all four tools, an unknown method, an unknown tool, `GET`, a foreign
  `Origin`, an oversized body). Local by default; `--base https://wikibento.toolforge.org` runs the read-only half
  against a deployment.
- `scripts/relay-guard-e2e.mjs` covers `/api/validate`, which `validate_board` calls into the same code as.
- `docs/PROXIES.md` places this route: it is **not** a relay — nothing upstream, no key, no model.
