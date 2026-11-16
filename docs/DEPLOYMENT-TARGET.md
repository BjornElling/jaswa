# Deployment target

**Status:** Binding deployment contract
**Reviewed:** November 5, 2026

JASWA is published at **`https://jaswa.net`**. While it is under development
the site is restricted to the developer's own IP address at Cloudflare, so no
one else can reach it yet.

## How a change reaches the site

**A push to `main` on GitHub is a deploy.** Cloudflare Workers Builds watches
the repository, runs `npm ci` and `npm run build` on a clean checkout, and
publishes the result. There is no staging step in between, which is why
AGENTS.md §1 still says to push only when asked: committing is local, pushing
is publishing.

`npm run deploy` (build, then `wrangler deploy`) does the same from this
machine. It is a fallback, not the routine path.

The build runs the Node major named in `.node-version`, the same one
`engines` in `package.json` requires.

## What is served

`wrangler.jsonc` is the contract. The site is the static build in `dist/`,
served by Cloudflare Workers Static Assets, with one exception:

- **Static files.** Everything `vite build` emits, plus `public/`. A path with
  no matching file returns the application shell, so client-side routes work.
  `public/_headers` adds HSTS, `nosniff`, a no-referrer policy and frame
  denial to every static response, and marks the content-named files under
  `/assets/` as cacheable for good.
- **The game's artwork, from R2.** Monster, rune and artifact images are the
  game's and are never committed (`.gitignore`), so a build from git has none.
  They live in the R2 bucket `jaswa-artwork`, and `worker/index.ts` serves
  `/monster-images/*`, `/rune-images/*` and `/artifact-images/*` from it — the
  only requests that run
  any code. A missing image is a 404, not the application shell.
  `public/.assetsignore` keeps the local copies out of a deploy made from this
  machine too, so both paths behave the same.
- **The helper installer.** `public/JASWA-Helper-Setup-<version>.exe` is
  tracked in git — only the current release, since nothing links an older one.
  `npm run release:helper` writes the new installer and removes the previous
  one; `verify:helper-version` fails if the tracked file is missing, is not
  the recorded release, or has company.

## After fetching new artwork

`npm run fetch:monster-images`, `fetch:rune-images` and
`fetch:artifact-images` update the local
folders and the committed manifests together. The manifests reach the site
with the next push; the images do not. Run **`npm run upload:artwork`** before
that push, or the site will ask R2 for files it does not have. The script
uploads exactly what the manifests name and refuses if any of it is missing
on disk. It needs `npx wrangler login` once on this machine.

## The helper and the published site

The helper accepts both `http://localhost:3000` and `https://jaswa.net`
(`helper/src-tauri/src/config.rs`), so a local tab and a published one can both
read the snapshot at once and share personalization through the helper's local
preference store. Its tray item **Open JASWA** opens the local server
when one is listening and the published site otherwise, because the local
server usually runs the newer JASWA.

## Two workspaces

Browser storage belongs to one origin. Imported accounts, export-folder
permissions and session state remain separate at `http://localhost:3000` and
`https://jaswa.net`. Personalization is shared automatically through the
running JASWA Helper (`LOCAL-PERSISTENCE-CONTRACT.md` § Origin); `.sw` remains
the portable backup. Both applications must contain the sharing client, and
the installed helper must support its preference endpoint. Building a new
installer does not update an already installed helper, and a local change
does not update the published site until an explicitly requested push.

## Cloudflare settings outside the repository

These live in the Cloudflare dashboard and are recorded here so they are not
forgotten:

- The custom domain `jaswa.net` on the `jaswa` Worker; `www.jaswa.net`
  redirects to it.
- The IP restriction that keeps the site private during development.
- **Always Use HTTPS** on the `jaswa.net` zone. Over plain `http` the helper
  refuses the page, the service worker does not register and WebGPU is
  unavailable; HSTS in `_headers` only takes effect after a first `https`
  visit.
- The R2 bucket `jaswa-artwork`.

Deployment credentials stay in Cloudflare and GitHub; none are in this
repository.

## Local development

During development `npm run dev` is the only application server, at
`http://localhost:3000/` (AGENTS.md §1.1). Visual verification happens there,
never against the published site.
