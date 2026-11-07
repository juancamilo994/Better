# Harness handoff

State of `/harness` on `feat/better-evaluation-loop` (draft PR #1) at the end of 2026-11-07. Open policy questions and known gaps live in [open-items.md](open-items.md). This file covers what works, what to do next and how to run it.

## Bottom line

The harness scores real websites end to end with live SubQ. A rerun on an unchanged page still moves the total by up to about 11 points. The next job is judge stability, scoped below. Everything else is solid or waiting on Elle.

## What works (verified with commands, not assumed)

- **Capture.** Real sites capture at desktop and mobile. Six of six tested pass: nngroup, linear, wikipedia, HN, stripe, vercel. Failed subresources are counted, not fatal. Long pages keep a clipped full-page image. Entrance animations finish before the freeze. The request cap is 600 under a 32 MB budget.
- **Measured deal-breakers.** axe-core 4.14.0 measures text contrast and target size; the mobile context measures reflow at 320px. A measured failure applies the proposed cap of 49. HN, Stripe and Linear fail contrast.
- **Live SubQ judge** (`subq-snap-1.1`). 26 of 26 responses validate. The demo scores 10 of 10 criteria; linear.app and wikipedia.org score 9 of 10, with System held at unknown where the measured spacing check contradicts full points.
- **Layer 3 ledger.** All 62 detector rules from Elle's tab, a native detector for six of them, an adapter for Impeccable JSON, and a per-viewport ledger with a top-three P0–P3 review.
- **Loop.** Project → capture → immutable run → selected fixes → one saved prompt → reevaluation and comparison.
- **Q-P8** (new in this handoff). `GET /api/projects` returns `latestRun` with an `overall` summary per viewport. Runs carry `overall` on read. `DELETE /api/projects/:id` archives the project: it leaves the list, and its append-only runs stay readable by ID. Verified with an in-process API smoke test, not yet in the test suite.
- **Tests.** 59 unit tests, lint, typecheck and build, built-API e2e, built-UI Chromium test, and seven benchmark fixtures all pass.

## Next job: judge stability

**Measured.** Three live runs on the unchanged demo, same captured build hash:

| Run | Desktop | Mobile |
|---|---|---|
| 1 | 67 | 56 |
| 2 | 61 | 61 |
| 3 | 67 | 67 |

Every run scored 10 of 10 criteria. The spread comes from one or two criteria (Interaction, Flow) flipping between half and full points. SubQ's confidence on those sits near 0.3. Juan's earlier report of 0 to 3 criteria and swings of 20 to 25 points predates `ec3fd82`, which fixed the rejections.

**Why it matters.** The pitch is "see your score move after you fix things." A delta is meaningless if an unchanged page moves 6 to 11 points.

**Proposed fix, in order:**

1. **Reuse judgments for unchanged evidence.** Key each judgment by screenshot hash, criterion, rubric, profile, judge and prompt version. A rerun on an unchanged build reuses the stored judgment, so its score cannot move. Compare captures by the content hash already stored. About half a day. This alone makes "no change → no delta" true.
2. **Sample three times where it matters.** For a changed build, ask each points criterion three times and keep the majority choice. Report how often the choices agreed. Triples judge cost, so make it configurable. About half a day plus a cost check.
3. **Flag low-agreement deltas.** When a criterion's choice changed but the samples disagreed, label the delta "uncertain" in the comparison instead of counting it as an improvement or a regression.
4. **Do not** average SubQ's choice probabilities into intermediate points. That would invent the intermediate scoring the rubric leaves unresolved.

**Decisive check.** Rerun the demo five times unchanged: totals must be identical (step 1). Then change one thing in the demo (for example, the hero copy) and confirm only the expected criteria move.

## Run it

```sh
cd harness
npm install
npm run dev                      # fixture judge; demo shows labeled SAMPLE scores
BETTER_JUDGE=subq BETTER_ALLOW_PAID_CALLS=true SUBQ_API_KEY=... npm run dev   # live judge
npm test && npm run lint && npm run build && npm run test:e2e && npm run test:ui && npm run test:benchmark
```

A live run makes about 26 SubQ calls (13 per viewport). Never commit the key; pass it through the environment.

## Traps that cost time

- A blank capture looks like a judge problem. When SubQ abstains with "not visible", look at the saved screenshot first.
- `@axe-core/playwright` needs `.setLegacyMode(true)`; its helper page is otherwise closed by the popup guard. It also needs scripts re-enabled.
- Playwright's default `caret: 'hide'` edits the DOM and trips the stability check; use `caret: 'initial'`.
- SubQ answers every question it is asked. Do not offer an abstain option inside the rating, and do not ask a question with only one real answer.

## Coordination

- Elle: ten scoring-policy questions in [open-items.md](open-items.md), plus confirming or reverting static scoring for Flow, Interaction and Usability.
- Juan: Q-P8 is ready to wire. Judge stability is now the most important open item, ahead of the remaining product items.
- The SubQ key was shared in a chat transcript; rotate it after the hackathon.
