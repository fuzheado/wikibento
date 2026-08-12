# Deployment

WikiBento is a pure static SPA — `dist/` is ~313 KB. It runs anywhere static files
are served. CORS is handled by the Wikimedia endpoints themselves, so **no proxy or
backend is required**.

## Local

```bash
npm install
npm run dev          # dev server, HMR, http://localhost:5173
npm run build        # production build → dist/
npm run lint         # oxlint
npx vite preview     # serve the built dist/ at http://localhost:4173
```

## Toolforge (recommended for a permanent URL)

Two options — both serve `dist/` as-is (the app uses absolute asset paths, so no
`base` path tricks are needed on the toolforge.org subdomain).

### Option A — tools-static (simplest, no webservice)

Copy the build to the tool account's `~/www/static/`; it's served at
`https://tools-static.wmflabs.org/{tool}/` (files under a path — the SPA works because
it has no router; `index.html` uses absolute `/assets/...` URLs, so it must be the
**document root** of that path, i.e. `~/www/static/index.html`).

```bash
npm run build
scp -r dist/* tools.wikibento@dev.toolforge.org:www/static/
# or rsync for repeatable deploys
rsync -av --delete dist/ tools.wikibento@dev.toolforge.org:www/static/
ssh tools.wikibento@dev.toolforge.org "chmod -R a+rX ~/www/static"
```

### Option B — toolforge.org subdomain (nicer URL, needs webservice)

Serve from `~/public_html/` with the lightweight default webservice:

```bash
npm run build
rsync -av --delete dist/ tools.wikibento@dev.toolforge.org:public_html/
ssh tools.wikibento@dev.toolforge.org "sudo -niu tools.wikibento webservice --backend=kubernetes static start"
# status:  ... webservice --backend=kubernetes static status
# deploy update: rsync again, then restart the webservice
```

Result: `https://wikibento.toolforge.org/`.

> Tool account (`tools.wikibento`) must already exist — create it at
> [admin.toolforge.org](https://admin.toolforge.org) if not.

### Option C — any static host

`dist/` is host-agnostic: Netlify, GitHub Pages, S3, a DreamHost `~/domain.com/`
directory, etc. There is no server-side code, no environment variables, no routing
rules. Just point any static file server at `dist/` and upload.

## Deployment Checklist

- [ ] `npm run build` — confirm 43 modules, no errors
- [ ] Smoke-test `npx vite preview` locally before shipping
- [ ] Verify the live URL loads and all 7 widgets fetch data (browser console clean,
      no CORS errors)
- [ ] Widgets hit `*.wikipedia.org`, `commons.wikimedia.org`, `wikimedia.org`,
      `wikistats.wmcloud.org` — all CORS-enabled; if any future source isn't, that's
      the moment to add a CORS proxy (see ROADMAP.md)

## Release Notes (2026-08-12 build)

- Vite 8.2.1 production build: 43 modules
- `dist/` = 313 KB total (index 0.58 KB, JS 299.0 KB / 89.7 KB gzip, CSS 14.4 KB / 3.4 KB gzip)
