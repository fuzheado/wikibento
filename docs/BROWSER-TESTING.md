# Browser testing

Every browser suite here drives the **repo's own `playwright-core`**, so the engines under test are the ones
the devDependency pins and no global tool has to be installed.

```bash
npm run test:browsers     # cross-engine matrix: the dashboard in Chromium + Firefox + WebKit
npm run smoke             # grid geometry + the panel-reachability constitution
npm run smoke:panels      # panel reachability only: every ⚙/ⓘ action reachable at w3 h3, 3 widths
- **`npm run smoke:url`** — the URL keeps telling the truth (ISSUE-87): a `?config=` claim is dropped when the
  board diverges, Share embeds the board on screen, present params stay reversible, and a quiet load is not
  treated as an edit. Also runs against a deploy: `AUDIT_BASE=https://wikibento.toolforge.org npm run smoke:url`.
npm run smoke:qr          # QR widget end-to-end (scan payload, quiet zone, param follow)
npm run smoke:share       # share panel + lean/kiosk modes
npm run smoke:wayback     # Wayback gallery states (loading / absent capture / error)
```

The cross-engine matrix exists because of a real outage: a `User-Agent` header on every browser fetch made
Firefox and WebKit preflight every RESTBase/CIM request, and Wikimedia's REST endpoints reject `user-agent`
in the preflight allow-list (the CIM service 405s `OPTIONS` outright), so about ten widgets died with
`NetworkError` in Firefox and "Load failed" in Safari **while Chrome stayed green** — Chromium strips the
forbidden header pre-preflight, per spec, masking the bug. See
[BUG-REPORT-ios-safari-fetch.md](BUG-REPORT-ios-safari-fetch.md).

## The demo sweep (ISSUE-100) — every board, every engine, desktop *and* phone

`browser-matrix.mjs` loads **one** board by default (the fast PR-time check). `--demos` turns it into the sweep that
would have caught the empty-box-on-iPhone report:

```bash
npm run test:browsers:demos                                  # 15 boards × 3 engines × desktop+phone
node scripts/browser-matrix.mjs --demos --base http://localhost:5199 --engines webkit,chromium --wait 9000
node scripts/browser-matrix.mjs --demos --require-relay      # fails if a box needed the no-relay fallback
node scripts/browser-matrix.mjs --demos --boards click-through --viewports phone   # one board, focused
```

Per run it asserts: **a card per widget in the board** (counted from the board JSON), **no error frames**, **no
console errors**, **no collapsed card** (a `.widget-body` rendering at zero height — the phone-stack bug), **no
card showing a placeholder instead of data** (a `.stat-value` of `—`, which is how the pageviews default-mode bug
hid), and **no empty ranking** (a `.ranking-rows` with no rows, which is how "Largest Wikipedias" sat blank once its
upstream CSV stopped answering).

The last two exist because a card can render *nothing* while every other check passes: no error, no 4xx, no
collapse, a clean console. They skip cards that are still loading or waiting or saying "No rows" — a card that
announces its state is not empty, and an uncalibrated version of this check flagged every card on a cold page load.
Both boards carrying one of every widget type are in the sweep for exactly this reason: `dashboard.json` (the
full-catalog board) is the single best target in the repo.

Two flags exist because the *host* changes what correct looks like: `--require-relay` (a host with `/api/proxy`
should never need the "Wikipedia reduced this for phones" fallback), and the documented benign-console list, which
explains each allowance rather than muting a category — including Toolforge's own `content-security-policy-report-only`
header, which lists Wikimedia hosts while this app deliberately talks to Internet Archive. A refusal *without* the
`[Report Only]` marker still fails the run.

Read the whole story in ISSUE-100: the sweep found a collapsed body, a User-Agent-gated navbox strip, and a static
widget sending a literal `{{widget:…}}` to Wikipedia in an iframe.

## Installing the engines

Install them **with the repo's own copy**, once:

```bash
node node_modules/playwright-core/cli.js install firefox webkit chromium
```

Two traps, both of which look like something else:

- **A mismatched Playwright version.** Each copy of `playwright-core` pins its own engine revisions, so
  installing with a different copy (a global `playwright`, another project's) gives
  `Executable doesn't exist at …` — the versions, not the install, are the problem.
- **`npx playwright install <subset>` prunes the engines you did not name.** Never install a subset.

Never export `PLAYWRIGHT_BROWSERS_PATH` globally; scope it to the command if you need it at all.

## Engines that are not the bundled ones

Set `PW_EXECUTABLE_<ENGINE>` to launch an engine through an explicit executable — a system Chrome, or a
launcher script on a host whose Playwright bundle cannot start by itself. Scope it to the command:

```bash
PW_EXECUTABLE_CHROMIUM="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npm run test:browsers -- --engines chromium
```

## Remote browser engines

For the WebKit leg on hosts where Playwright has no WebKit build (e.g. linux-arm64): run
`scripts/remote-browser-daemon.mjs` on a machine that does have it (macOS, x64 Linux), then connect from the
test box.

```bash
# on the daemon host (e.g. an Apple-silicon Mac):
node scripts/remote-browser-daemon.mjs --engines webkit --port 9322

# on the test box: get a live endpoint, rewrite localhost → the daemon's IP, run the matrix
curl -s -X POST -H 'content-type: application/json' -d '{"engine":"webkit"}' http://<daemon-ip>:9322/launch
PW_WS_ENDPOINTS="webkit=ws://<daemon-ip>:<port>/<id>" PW_WS_HOST=<daemon-ip> \
  npm run test:browsers -- --engines webkit
```

`<port>/<id>` come from the `/launch` reply's `wsEndpoint` — that is a **second, ephemeral port**, not the
daemon's `9322`. `PW_WS_HOST` is what the test box rewrites `localhost` to inside the dashboard URL, so the
remote browser can reach the dev server.

`scripts/browser-matrix.mjs` carries the same recipes in its header, next to the code that implements them.
