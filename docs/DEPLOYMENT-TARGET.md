# Deployment target

JASWA is a static React application. It builds into `dist/` and Cloudflare
Workers Static Assets serves that directory. There is no application server,
SSR runtime, database binding, or deployment-specific adapter.

`wrangler.jsonc` is the deployment contract: it names the Worker, points to
`dist/`, and returns the application shell for a client-side route that has no
matching asset. `npm run deploy` first makes the production build and then
hands that exact output to Wrangler.

The repository may later use GitHub Actions or Cloudflare Workers Builds. Both
need only `npm ci` followed by `npm run deploy`; deployment credentials remain
in the chosen provider's secret store. Creating the Worker, selecting a domain,
and supplying credentials are production decisions and are intentionally not
performed by this repository.

During development, `npm run dev` is the only application server and always
uses `http://localhost:3000/`. `npm run test` runs deterministic domain checks
and a Playwright browser check against the real Vite application.
