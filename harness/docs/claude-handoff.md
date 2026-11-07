# Better → Claude handoff

Continue the existing Better build. The latest requested evidence extension is implemented, tested and pushed. Preserve the architecture and Elle’s ten criteria, weights and proposed scoring policy. No restart or new axes.

## Checkpoint

- Repo: `/Users/laul_pogan/Source/Better`
- Branch: `feat/better-evaluation-loop`
- Implementation commit: `3e70ec4` — versioned evidence checks and calibration fixtures.
- Integration checkpoint: `65dab4e` — latest upstream coordination docs merged, preserving both teams’ notes. This handoff is a subsequent documentation-only commit.
- Draft PR: https://github.com/juancamilo994/Better/pull/1
- At handoff preparation: clean working tree; local/remote checkpoint matched; PR mergeable. No GitHub CI checks configured. Reverify current state before edits; other teams work here.

## Read first and respect ownership

Read applicable AGENTS.md, `TEAM.md`, `PRD.md`, `PRODUCT.md`, `harness/README.md` and `harness/docs/implementation-plan.md`. Shared contracts, once present, outrank team docs. The user’s current constraints override older conflicting asks in those docs.

Paul owns `/harness`; Juan owns the product app, shared contracts, design and root docs; Elle owns `/rubric`. Everyone can append coordination notes to `TEAM.md`. Do not overwrite other teams’ work. Branch commits, explicit-path staging and pushes are authorized; merging this PR into main is not requested.

Elle’s Combined source was read in full during implementation:
https://docs.google.com/document/d/1A50rMO06UQiaeDj67-xp4jiZ86p0gcjOvnlKP7e6nqQ/edit

`harness/config/rubric.json` transcribes that proposed policy and was unchanged by the evidence extension. Use the eventual repo-owned rubric through the configurable path once Elle lands it; do not replace her policy with legacy defaults.

## Architecture and live callers

Node 24+, TypeScript, Express, Playwright, SQLite and evidence files. Loopback-only local service, default port 3000. Native harness UI at `/`; Juan’s separate product app is not wired by this change. Preserve project → matched desktop/mobile capture → evidence → immutable run → selected fixes → saved implementation prompt → reevaluation/history.

`POST /api/projects/:id/runs` calls `evaluateProject` → capture/judges → `buildAssessment` → post-visual reconciliation → scoring summary → immutable `Store.saveRun`. Handoff POST calls `assemblePrompt`; UI renders the saved run. Default viewports are 1440×900 and 390×844. Public capture remains bounded, GET-only and frozen; preserve existing public-target/DNS/relay protections.

## Implemented in the latest extension

1. `config/check-registry.json`: 14 curated, versioned supporting checks declaring primary criterion, applicability/states, required evidence, verifier, issue family, allowed exceptions and source revision. Runs snapshot/hash the registry in `assessment.registry` and `versions.checks`. Reevaluation retains it unless `useLatestChecks: true`. Current registry endpoint: `GET /api/check-registry`; override path with `BETTER_CHECK_REGISTRY_PATH`. No external skill runtime dependency.
2. `src/evaluation/evidence.ts`: explicit present, partial, verified-missing-and-needed, not-applicable and unknown statuses. Missing-and-needed requires verified applicability and runtime evidence. Exceptions require evidence/reason; passwordless alternatives are supported. A missing screenshot feature is not proof of an unimplemented feature. Partial/unknown checks have unknown verdicts; no missing-evidence normalization.
3. Optional `profile.taskSteps: [{id,goal,intendedOutcome}]`, defaulting to the declared core job. Goal clarity, next-action visibility, intended action meaning and progress are separate checks. Default/empty/loading/partial/error/success states are evidence-ledger entries, not states to manufacture. Partial evaluations retain useful evidence; both captures failing yields a failed run.
4. Structured findings retain criterion, family, task step, viewport/state, evidence IDs, verifier, coverage, severity, separate confidence, observed/hypothesized impact, concrete fix and exception status. Reconciliation records aligned/complementary/conflicting findings. `underlyingDefectId` can link checks through a trusted verifier. No extra per-check deductions. Contradictory homes or explicit conflicts stay for human review; conflicting selected fixes cannot enter a handoff. Verified failures cannot be erased by taste. A verified failure contradicting a full-points judgment holds the criterion unknown; the original result remains intact.
5. Visual assessment runs before deterministic results and receives only its whitelisted evidence/brief, never accumulated detector counts. Specificity uses audience, desired feeling and core job. AI-isms stay within Originality. Semantic duplicate identification/classification still needs calibration; arbitrary wording is not a proven duplicate detector.
6. Six paired authored HTML calibration candidates in `fixtures/benchmark`: clipping vs accessible disclosure; long names/URLs at narrow width and 200% authored text size; intentional branding vs unrelated styling; apparent vs operating controls; value-preserving error recovery; partial results with one failed component. Chromium records bounded fixture assertions, screenshots, DOM/styles and runtime evidence. Branding judgment remains unknown without an actual judge. Candidates are not validated ground truth.
7. `public/` keeps the ten-criterion fingerprint and adds a native disclosure with exact values/maxima, explicit Unknown values and textual changes for compatible runs. Keyboard/pointer disclosure parity and expanded-table fit at 360/400px are verified. Task/state coverage and structured findings are progressively disclosed.
8. `src/evaluation/explanations.ts` generates one prompt from selected grounded findings only, plus a short evidence-backed “preserve these” list or explicit preservation constraints when no product strengths were verified. It never promises conversion or satisfaction gains from a higher Better score.

Other changed seams: `src/domain.ts`, `src/app.ts`, `src/evaluation/pipeline.ts`, `src/judges/subq.ts`, prompt version in `src/config.ts`, and corresponding tests/docs. Historical eight-axis runs remain readable; `config/legacy-rubric.json` is regression-only.

## Scoring boundaries to preserve

- Ten maximums: Hierarchy 12; Information density 12; Flow & effort 10; Interaction & feedback 12; Audience & tone fit 12; Originality 10; Visual communication 10; System consistency 8; Typography 6; Usability basics 8. Total 100; render names/order/weights from config.
- Separate criterion points, evidence coverage, observed subtotal, raw total, deal-breakers and capped total. A full raw total requires all ten point assessments. Unknown never becomes zero/pass/fail or a prorated total. Desktop/mobile totals remain separate.
- Proposed cap 49 applies only to applicable, verified failing deal-breakers. Supporting checks do not independently deduct points. Source score bands/anchors come from config, not legacy 1–4 ratings.
- Policy still unresolved: exact half/rounding, intermediate points, approximate usability deductions and per-AI-flag costs. Current proposed choices are zero/exact-half/full. Do not silently settle these proposals.
- Readability vs message clarity and apparent affordance vs verified behavior remain separate. Cross-device adaptation needs matched captures; local defects do not get duplicate adaptation penalties. Credibility concerns claims presentation, not the company’s actual trustworthiness. Remove filler while preserving essential labels, errors and instructions.
- Proposed under-100ms feedback target and under-400ms deal-breaker threshold are distinct settings requiring runtime evidence. Neither is verified by still images. Simplified usability checks do not establish complete WCAG conformance.

## Verification already completed

From `/harness`:

```sh
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:ui
npm run test:benchmark
```

45 unit tests passed; lint/typecheck/build passed. Built HTTP API and UI were exercised in real Chromium, including paired captures, evidence integrity, selected-only saved handoffs, comparison/history/restart, registry freezing/explicit updates, partial vs failed outcomes, exact zero vs Unknown rendering, keyboard/pointer disclosure and desktop/360/400px layouts with no console/request errors. All six fixture cases passed. Screenshots were inspected; an initial mobile table overflow was fixed and reverified. `harness/memory/gate-failures.md` records that and a corrected test-envelope assumption.

Fresh read-only review found no supported major/blocker defect. It did not independently rerun browser tests. SubQ tests use authored mock transports; no live provider accuracy or billing validation is claimed. Local screenshots/reports are ignored under `harness/test-results/`, including `benchmark/report.json`; they are not committed. Tests use temporary stores. No need to reinstall dependencies or rerun unchanged checks just to recreate this handoff.

## Remaining work and explicit deferrals

The requested extension is complete. No additional feature has been selected for this handoff; wait for the user’s next scoped instruction rather than treating every team note as authorization.

- Public-site runtime/contrast/320px verifiers are not connected. Static SubQ cannot verify motion, response times, keyboard operation or successful task completion. Related checks remain unknown; a complete public-site composite is not established.
- Human calibration, semantic duplicate accuracy and unresolved scoring policy remain open. The controlled fixture judge has no authored Combined point scores, so the demo’s ten quality points remain unknown rather than invented.
- Juan’s follow-ups Q-P8 (DELETE project/latest-run summary), Q-P9 (demo point calibration), eventual `/rubric` path/shared-contract integration and product-app wiring are separate work. Preserve them in coordination notes; do not broaden this finished slice.
- Personality mode, actual-site generated previews/automatic editing, video judging, pairwise tournaments, broader gestures, manipulation-path audits, analytics experiments, external skill installations and live paid inference remain deferred. Pairwise is a disabled extension point. No new axes.
- Explicit current user prohibition on new paid calls overrides older team approval. Existing credentials are not reproduced here; keep secrets server-side and out of commits. Do not infer spending authorization from key availability.
