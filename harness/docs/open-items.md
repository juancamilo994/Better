# Open items

What the harness leaves unresolved as of 2026-11-07 (`ec3fd82`, PR #1). Each item names who decides. Until someone decides, the harness reports the affected value as unknown or pending. It never guesses.

## Scoring policy: Elle decides

1. **Static scoring for three criteria.** Flow, Interaction and Usability points now score from screenshot, text and DOM. Their behavioral checks stay unknown. Without this change no run could reach a total. Confirm or revert (`15e84ca`).
2. **Two-criterion flags.** A Layer 3 flag mapped to two criteria costs 2 points in each, read from "counts once per criterion". Confirm.
3. **Deduction order.** The source does not say whether Layer 3 deductions apply before or after the Originality cap. When the two orders disagree, the criterion is unknown. In practice that happens whenever three AI-tell flags fire.
4. **Zero floor.** None is specified. A criterion whose deductions exceed its raw points is unknown.
5. **Off-system rules.** Four rules are listed as "Flag / Advisory" without a split. They deduct nothing.
6. **Typography thresholds conflict.** Type-size count: 5 (criterion 9) vs 6 to 8 (craft kit). Body minimum: 16px vs 12px body and 11px UI (Layer 3). Line length: 50 to 75 characters vs about 80. The harness keeps criterion 9's values.
7. **Intermediate points.** Anchors allow zero, exact half and full only. "About half", "about 2 points per usability failure" and per-AI-flag costs are not allocated.
8. **Layout stability.** The source names no criterion for it. It is provisionally Usability.
9. **Harness proposals.** The 75% on-scale spacing threshold and the distinct-type-size count are Paul's proposals. The spacing check fails on 5 of 6 real sites tested; it likely needs loosening.
10. **Weights, cap of 49, tie-breaker.** All are still marked proposed in the source.
11. **Deal-breaker sensitivity.** Gates fail on a single measured node (contrast) or 1 px of reflow overflow. Observed 2026-11-07: 3/3 real sites capped at 49 via BODY_CONTRAST + MOBILE_REFLOW — Teleprompter (raw 88; contrast 1/45 nodes; reflow +30 px), Bitzy (raw 93; contrast 49/181; reflow +36 px), Cerebral Valley (raw 89; contrast 11/341; reflow +142 px). Severity varies wildly under the same verdict — one node counts the same as 27% of nodes, 1 px the same as 142 px. Needs a severity threshold or graduated cap decision.

## Calibration: Elle and a second reviewer

- Live SubQ confidence runs 0.2 to 0.6. Scores are uncalibrated.
- The source asks for a small shared labeled set: obvious defects, close pairs and style differences. Then compare human agreement, judge disagreement and repeat stability. Nothing has run yet.
- Elle's worked example (Ex 1 = 33, Ex 2 = 88) is a ready target, but those are screenshots and the harness takes URLs only.
- The six benchmark fixtures and the changing-text fixture are calibration candidates, not ground truth.

## Coverage gaps: Paul

- **Layer 3 total.** It needs all 62 rules covered. The local Impeccable registry maps 42; native rules cover 6. Real sites stay `partial` until a newer detector result supplies the rest.
- **Unverified deal-breakers.** Non-text contrast, placeholder contrast, keyboard focus, color-only signals and feedback delay have no verifier. They stay unknown.
- **Runtime checks.** Busy buttons, five data states, layout stability on real sites, interaction behavior and motion need runtime or recorded evidence. None is captured for public URLs.
- **Reflow at 320px** measures CSS only. Scripts are frozen, so script-driven layout is not tested.
- **Advisory adjudication** comes in with the run request. There is no endpoint to adjudicate after a run.
- **Legacy eight-axis path** still exists for old runs and tests. Removal is deferred.

## Product and integration: Juan

- PRD §6 still describes the eight-axis 1 to 4 scale. PRD §7 marks live previews as decided; the source doc defers them.
- `Placeholder rubric.md` is superseded by the Combined rubric.
- The harness reads `harness/config/rubric.json`. TEAM.md says the rubric lives in `/rubric`. Point the harness there once Elle lands it.
- Q-P8 (DELETE project, latest-run summary) is open.
- Real-URL demos need `BETTER_JUDGE=subq`, `BETTER_ALLOW_PAID_CALLS=true` and `SUBQ_API_KEY` in the harness environment.

## Security and operations

- The SubQ key was shared in a chat transcript. Rotate it after the hackathon, as planned.
- Billing, autocharge and rate limits for the SubQ account are still unverified.

## Deferred by decision

Pairwise comparison, screenshot upload, personality mode, generated previews of the actual site, automatic site edits, video judging, gesture and manipulation-path audits, and analytics experiments.
