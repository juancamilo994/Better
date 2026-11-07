# Better evals

An end-to-end test runner for Better. Each run:

1. **Starts fresh.** A new, empty harness data folder every time, so no projects or history carry over. Your real `harness/data` is never touched.
2. **Starts both servers itself:** the harness on port 3100 and Juan's web app on 3101, so it doesn't collide with your normal 3000/3001.
3. **Opens a visible Chrome window** and clicks through the product like a user, showing each site under test and each score page as it goes.
4. **Repeats** scored cases (`--repeat N`) to check stability.
5. **Writes a report** to `evals/results/<timestamp>/report.html` (screenshots, pass/fail per check, raw scores) plus `results.json`, and opens it when done.

## Run it

Needs the harness built (`cd harness && npm ci && npm run build`) and the web app installed (`cd apps/web && npm install`). Then:

```sh
cd evals
npm install
npm run eval -- --suite smoke                  # free: plumbing, honesty, demo improvement
npm run eval -- --suite core --judge subq      # live judge: uses SubQ credit
npm run eval -- --only pair-contrast --repeat 3 --judge subq
npm run eval -- --list                         # list cases and suites
```

Flags: `--suite smoke|core|full`, `--only id,id`, `--repeat N`, `--judge fixture|subq`, `--headless`, `--slow ms` (browser slow-motion, default 200), `--harness-dir`, `--web-dir`, `--pages-base`, `--keep-open`.

If the web app lives elsewhere (for example a separate checkout of `juan/web-scaffold`), pass `--web-dir ../path/to/apps/web`. Stop any other `next dev` running in that same folder first; Next.js allows one dev server per folder.

`--judge subq` reads `SUBQ_API_KEY` from `harness/.env` and turns paid calls on for that eval run only. Each scored run costs roughly 20 to 30 SubQ calls. `--judge fixture` costs nothing, but the harness never gives fixture scores to public pages, so only measured checks (contrast, overflow, text size) and the built-in demo produce numbers.

## Test groups

| Group | Case ids | What passing means |
|---|---|---|
| 1. The loop works | `ui-loop` | Create, onboard, score, recommend, prompt and reevaluate all work in the web app with no browser errors |
| 2. Stability | `stability` | The same unchanged page scores within 2 points across 3+ runs, with the same coverage and no failed judge calls |
| 3. Tells good from bad | `pair-typography`, `pair-contrast`, `pair-clutter` | A page with a planted defect scores lower than its clean twin, on the criterion that was broken |
| 4. The loop improves a site | `improve-demo` | The built-in demo's fixed version beats its baseline on the fixed issues |
| 6. Mobile only | `mobile-only` | A page that only breaks on phones scores lower on mobile and trips the reflow deal-breaker |
| 7. Honest failures | `honest-unreachable`, `honest-private` | Bad URLs fail clearly or are refused; no scores are invented |
| 8. Real-world sanity | `real-world` | Informational: public sites tracked over time |

Group 5 (deal-breaker cap at 49) is covered inside `pair-contrast`; the cap only shows on the total once all ten criteria can be scored.

## Test pages

`evals/pages/` holds controlled pages with planted defects (tiny type, low contrast, clutter, mobile-only overflow) and clean twins. The harness blocks localhost and private addresses on purpose, so the pages are served from this branch on GitHub through raw.githack.com. Change the host with `--pages-base`.

Cases and suites live in `cases.json`; add a case there and, if it needs new logic, a matching `kind` in `run.mjs`.

## Test log

Every run appends its results to [TEST-LOG.md](TEST-LOG.md), next to the pre-registered expectation for each test. `--no-log` skips that. `probes/` holds the scripts used for the score-drift investigation.
