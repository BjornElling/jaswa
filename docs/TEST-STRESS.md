# Stressing the test suite

Run `npm run test:stress` against the local app on `http://localhost:3000/`.
Reuse a working server; Playwright starts the development server if needed.

The command repeats the normal domain chain three times, sequentially, while
Playwright repeats every browser test three times with six concurrent workers
(the normal suite uses two). Retries are disabled: an intermittent failure must
leave a failed run. This exercises calculation contention and test isolation
without changing the normal suite's timeouts or assertions.

For a different load, use:

```sh
npm run test:stress -- --repeats=5 --workers=8
```

Each invocation writes to its own directory under `work/test-stress/`:

- `domain-N.log`: each domain pass, including its original failure output.
- `browser.log` and `browser.json`: browser output and per-test results.
- `browser-results/`: test artifacts and retained failure traces.
- `summary.json`: exit codes, durations, domain skips and browser result counts.

The command exits unsuccessfully if any pass fails. Later domain passes still
run after an earlier pass fails, but each pass keeps the normal chain's
stop-at-first-failure behavior. Fix that failure and repeat to reach the checks
behind it. Read the browser JSON for test skips; a successful exit alone does
not establish that everything ran.

The real-account checks use `JASWA_IMPORT`, falling back to
`%TEMP%/claude/shots/game.json`. Missing captures are reported as skips, also
printed while the command runs. They are not passes. Artifacts can include
account data; keep them local. The acquisition-order check also reports a skip
when its optional traffic-log login snapshot is missing (`JASWA_TRAFFIC_LOG`).

This covers the package behind `npm test`. The optional large calibration,
benchmark and real graphics-card checks remain separate commands. A green
stress run establishes only that the measured repetitions passed at that load;
it does not prove the absence of intermittent failures.

Tests of a calculation's pending state should control the worker boundary with
`tests/hold-worker-requests.ts`: hold before the action, assert the pending
state and reserved layout, release, then assert the settled result. A warm
worker can finish before Playwright's first assertion; waiting longer cannot
recover a state that already passed.

Layout checks wait for the affected workspace to render before capturing their
reference boxes. An import badge can be ready while a lazy workspace is still
loading; an empty array of boxes is not a layout baseline.
