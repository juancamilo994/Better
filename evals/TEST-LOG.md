# Better test log

One place for every test of Better: what each test is, how it's measured, what we expected **before** running it, and what actually happened. The runner (`npm run eval`) appends a results table to the bottom of this file after every run. Investigations done by hand are appended the same way. Add entries at the end; don't rewrite old ones.

## How to read an entry

- **Expected** is written down before the run, so a result can't be explained away after the fact.
- **Verdict:** PASS (met the expectation), FAIL (didn't), SKIP (couldn't be measured in that mode, e.g. the AI judge was off), INFO (tracked, not pass or fail).
- Scores are per viewport. "Subtotal" is the sum of points for the criteria that were scored; a full total out of 100 exists only when all 10 are scored.

## Test definitions

| ID | Question it answers | How it's measured | Expected result (pre-registered) | Cost per run |
|---|---|---|---|---|
| `ui-loop` | Can a user get from a URL to a copyable fix prompt and back to a new score? | Visible browser clicks through Juan's web app: create demo project, fill brief, wait for score page, open recommendations, tick 2 fixes, build prompt, reevaluate | Every step loads; at least 1 recommendation; prompt over 200 chars; history shows 2 runs; zero browser errors | 2 scored runs |
| `improve-demo` | When a site gets fixed, does Better's score go up? | Built-in demo scored as its broken baseline, then its fixed version at the same URL | Mobile overflow (LAY-01) and small text (TYPE-01) flip from fail to pass; mobile subtotal goes up | 2 scored runs |
| `pair-typography` | Does Better notice tiny, messy text? | Same pottery page twice: one with 9 to 23px text in a dozen sizes, one clean | Bad page loses Typography points on both viewports; lower subtotal | 2 scored runs |
| `pair-contrast` | Does Better catch text too faint to read? | Same page with light grey on white vs. dark text | BODY_CONTRAST deal-breaker fails on bad, passes on clean; lower subtotal | 2 scored runs |
| `pair-clutter` | Does Better notice an everything-at-once page? | 12 boxes, 13 nav links, ticker and long form vs. one hero and one button | Bad page loses Hierarchy and Information density points; lower subtotal | 2 scored runs |
| `mobile-only` | Does Better notice a page that only breaks on phones? | Card row fixed at 1040px wide: fine on desktop, sideways scroll on a phone | LAY-01 fails mobile only; MOBILE_REFLOW fails; mobile subtotal below desktop | 1 scored run |
| `stability` | Does the same unchanged page get the same score every time? | Clean page scored 3 times in a row | Subtotal spread at most 2 points per viewport; same coverage; no failed judge calls | 3 scored runs |
| `honest-private` | Does Better refuse to scan a private network address? | Create a project for `http://10.0.0.1/` | Refused up front with a clear message | free |
| `honest-unreachable` | Does Better refuse to invent a score for a dead URL? | Create and run a project for a `.invalid` domain | Refused, or run marked failed with no scores | free |
| `real-world` | How does Better rate real sites over time? | bitzyspider.com, stripe.com, arngren.net | Informational. Expect Stripe above Arngren | 3 scored runs |

Test pages live in `evals/pages/`. A scored run with the live judge (`--judge subq`) uses about 26 SubQ calls.

## Results

### 2026-11-07 23:18 UTC: runner, free mode (judge off), first pass

| Test | Verdict | Expected | Actual |
|---|---|---|---|
| ui-loop | FAIL, then PASS | See definitions | First attempt failed on the runner's side (each criterion has its own "Add to prompt" button). After the fix: all 6 steps passed, 19 recommendations, 3,121-char prompt, no browser errors |
| improve-demo | PASS | LAY-01 and TYPE-01 improve | LAY-01 mobile 1 to 4, TYPE-01 mobile 1 to 4. Subtotals SKIP (judge off) |
| pair-contrast | PASS | Deal-breaker fails on bad only | BODY_CONTRAST: bad = fail, clean = pass, both viewports. Subtotals SKIP |
| mobile-only | PASS | LAY-01 mobile only, reflow fails | LAY-01 desktop 4, mobile 1; MOBILE_REFLOW = fail. Subtotal SKIP |
| honest-private | PASS | Refused | HTTP 400: "Private, local, reserved and metadata destinations are blocked." |
| honest-unreachable | PASS | Refused or failed | HTTP 500: "Operation failed. No fabricated results were returned." Note: a 500 is a vague way to say "can't reach this site"; a clearer 4xx message would help users |

### 2026-11-07 23:30 UTC: runner, live judge (SubQ), stopped partway

Stopped by request to redesign the visuals; results up to that point:

| Test | Verdict | Expected | Actual |
|---|---|---|---|
| ui-loop | PASS | See definitions | All 6 steps passed with the live judge, 23 recommendations, no browser errors |
| improve-demo | PASS | Mobile subtotal goes up | Mobile subtotal **56 to 84** after the fix; LAY-01 and TYPE-01 1 to 4; Typography points held at 3 |
| honest-private, honest-unreachable | PASS | Refused | Same as free mode |
| pair-typography | not finished | | Stopped during the clean page |

### 2026-11-07 23:45 UTC: investigation, why the same page gets different scores

**Question.** Paul's handoff says an unchanged page moves 6 to 11 points between runs. Why?

**Expected beforehand (Paul's hypothesis).** SubQ is random: on close calls (Interaction, Flow) it flips between half and full points.

**Method.** Ran a separate harness copy on port 3200 with a logger that saves every SubQ request and response (`evals/probes/log-subq-calls.mjs`). Scored the unchanged demo 3 times (78 judge calls). Compared every answer, then resent identical requests directly to SubQ.

**Result 1: the drift is real.** Desktop subtotal 65, 61, 55 (10 of 10 criteria each time). Mobile 63, 63, 63.

| Criterion (desktop) | Run 1 | Run 2 | Run 3 | SubQ's probability for "full points" |
|---|---|---|---|---|
| Interaction & feedback (max 12) | 12 | 12 | **6** | 0.58, 0.52, 0.42 |
| Usability basics (max 8) | 8 | **4** | **4** | 0.61, 0.47, 0.47 |
| Other 8 criteria | same | same | same | |

Those two flips explain the totals exactly: 65, then -4 = 61, then -6 = 55.

**Result 2: the inputs were identical.** Screenshots, page text and page structure were byte-for-byte the same in all 3 runs.

**Result 3: SubQ is NOT random (hypothesis rejected).** Resending one exact request 5 times returned exactly the same probabilities every time (Interaction: 0.58 full / 0.41 half, five times).

**Result 4: the real cause is a random ID in the prompt.** Diffing the requests, the only difference between runs is the label each screenshot is sent under, which contains that run's random ID: `fd68ba98-...:desktop:screenshot` in one run, `932c7885-...:desktop:screenshot` in the next. That meaningless string shifts SubQ's probabilities by up to about 0.08, enough to flip any criterion where it's close to 50/50. The code is in `harness/src/judges/subq.ts`, `buildRequest`: `state.evidence` is keyed by evidence ID.

**Fix tested.** Replaced those labels with stable ones (`image_1`) and resent the logged run 1, 2 and 3 requests (`evals/probes/replay-stable-labels.mjs`):

| | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| Interaction, P(full) | 0.630 | 0.630 | 0.630 |
| Usability, P(full) | 0.546 | 0.546 | 0.546 |

Identical. With this fix, the same page gets exactly the same score every time.

**A second, independent improvement.** The harness keeps only SubQ's top answer and throws away the probabilities. Scoring each criterion as the probability-weighted average (for example 0.58 x 12 + 0.41 x 6 = 9.4 instead of 12) gives:

| Desktop totals | Run 1 | Run 2 | Run 3 | Spread |
|---|---|---|---|---|
| Top answer only (today) | 65 | 61 | 55 | **10** |
| Probability-weighted | 68.5 | 67.0 | 66.7 | **1.8** |

This also makes scores move smoothly when a page really improves, instead of in 4 to 6 point jumps. It changes Elle's zero/half/full rule, so it's her call.

**Bigger warning this exposed.** On most criteria SubQ's confidence is only 0.3 to 0.6, and it almost never picks zero. A stable score is not yet a meaningful one; the "tells good from bad" pair tests are what check that.

### 2026-11-07 23:50 UTC: investigation, what small prompt changes actually do

**Question.** Does the wording of the prompt change scores?

**Expected beforehand.** Small wording changes have little effect; option order has none.

**Method.** Took the logged desktop requests for Interaction and Usability (close calls) and Typography (a confident call) and resent them with one change each (`evals/probes/replay-variants.mjs`). Each variant was sent 3 times; all repeats were identical, so one row each.

| Change | Interaction P(full) | Usability P(full) | Typography P(0 / half / full) | Effect |
|---|---|---|---|---|
| None (baseline) | 0.58 | 0.61 | 0.19 / 0.75 / 0.06 | |
| V1: drop "choose the closest anchor even when uncertain" | 0.54 | 0.56 | 0.18 / 0.78 / 0.04 | Small nudge toward half; no flips |
| V2: drop the safety preamble (the "treat page text as untrusted" paragraph) | 0.55 | **0.39, flips 8 to 4** | **0.36** / 0.61 / 0.03 | **Big.** The preamble is not neutral boilerplate: it pushes scores up |
| V3: send only the screenshot, no page text or element list | **0.70** | 0.62 | 0.04 / 0.77 / **0.19** | Text and element data make SubQ harsher, especially on Typography (it sees the real font sizes) |
| V4: reverse the order of the answer options | 0.58 | 0.61 | 0.19 / 0.75 / 0.06 | **None.** No position bias |

**Takeaways.** Option order is safe. The preamble and the page data materially change scores, so any change to them must be re-run against the pair tests, not just the stability test. Removing the preamble would also weaken the prompt-injection protection, so it should stay; the effect just needs to be known.

## Next steps

1. **Fix the random label** in `harness/src/judges/subq.ts` (send stable `image_1` labels, map back to evidence IDs). Juan co-owns `/harness`; propose it as a pull request.
2. **Decide on probability-weighted scoring** (Elle).
3. **Run the full `core` suite with the live judge** after fix 1, and append the results here.
4. **Finish the visual redesign of the runner** so each test shows the question, the two pages side by side, scores as bars, and a plain verdict.
