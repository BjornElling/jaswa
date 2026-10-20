# Deployment target

**Status:** Binding deployment contract
**Reviewed:** October 20, 2026

JASWA is a static React application built with Vite. It builds into `dist/`
and Cloudflare Workers Static Assets serves that directory. There is no
application server, SSR runtime, database binding, or deployment-specific
adapter.

`wrangler.jsonc` is the deployment contract: it names the Worker, points to
`dist/`, and returns the application shell for a client-side route that has no
matching asset. `npm run deploy` first makes the production build and then
hands that exact output to Wrangler. Deployment credentials stay in the
provider's secret store; creating the Worker, choosing a domain and supplying
credentials are production decisions this repository does not make.

Nothing is deployed unless the user asks (AGENTS.md §1.1). During development
`npm run dev` is the only application server, at `http://localhost:3000/`.
