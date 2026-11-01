# Verification isolation

Module-reading checks use `createVerificationServer` from
`scripts/verification-server.mjs`. It evaluates TypeScript through Vite's SSR
loader without listening on a preview port. Every invocation owns a temporary
cache, removes it on close, and disables browser dependency optimization,
file watching, HMR and WebSockets.

A check using the application's `node_modules/.vite` cache can replace the
dependency files a browser or calculation worker is still loading. Separate
middleware servers also compete for port 24678 unless WebSockets are explicitly
disabled; `hmr: false` alone does not stop that listener. Neither belongs in a
module-reading check. The application server also excludes generated Playwright
results, traces and other output from its watcher.

`tests/verification-isolation.spec.ts` runs two module loaders alongside a real
Rune Clean-up calculation, writes a generated HTML artifact and checks that the
browser receives no update or reload and returns all four verdicts. It also
checks that the loaders use separate caches and remove them when closed.
Run it with Re-app's real flow using two workers:

```sh
npx playwright test tests/verification-isolation.spec.ts tests/reapp-targets.spec.ts --repeat-each 4 --workers 2
```

Keep application source unchanged during a browser run: a requested HMR update
is allowed to discard a calculation's transient state. Increasing timeouts or
serializing the suite does not fix interference between checks.
