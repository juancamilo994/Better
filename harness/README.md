# Better evaluation harness

Local website capture, evidence, immutable evaluations and selected-fix prompts now use [Elle’s Combined rubric (0–100)](https://docs.google.com/document/d/1A50rMO06UQiaeDj67-xp4jiZ86p0gcjOvnlKP7e6nqQ/edit). Existing architecture is preserved. Native UI at `/` exercises the same API; it does not replace Juan’s product app or claim C1–C5 compatibility.

## Run

Node 24+ with SQLite support required. From `/harness`:

```sh
npm ci
npx playwright install chromium
npm run build
npm start
```

Open `http://127.0.0.1:3000`. Loopback only, single operator. SQLite/evidence persist under ignored `data/`; `BETTER_DATA_DIR` changes location. Keep the entire directory across restarts. Paste a URL and supply audience, desired feeling and one core job. Select supported fixes, save/copy one prompt and reevaluate the same project. `npm run demo` exercises the controlled API without paid calls.

## Proposed scoring

`config/rubric.json` transcribes the source read in full November 7, 2026 (modified 21:08:29 UTC). Configure it there or select `BETTER_RUBRIC_PATH`. Each run snapshots full rubric/profile and hashes. Reevaluation retains the snapshot unless `useLatestRubric` is true. Old eight-axis runs remain readable; `config/legacy-rubric.json` supports compatibility tests.

Ten maximums: Hierarchy 12, Information density 12, Flow & effort 10, Interaction & feedback 12, Audience & tone fit 12, Originality 10, Visual communication 10, System consistency 8, Typography 6, Usability basics 8. Names/counts/weights come from configuration.

`quality.desktop` and `.mobile` separately expose criterion points, coverage, observed subtotal, raw total, nine deal-breaker findings, cap status, capped total, band and unresolved policy. Supporting subchecks add no deductions. Full raw total exists only with all ten criterion points. Missing evidence is unknown: no invented zero, pass, failure or normalization. No cross-device total. Applicable verified failure applies proposed cap of 49 without changing raw points. Unknown gates remain unresolved.

Source bands: 90–100 distinctive/effortless; 75–89 strong with fixable flaws; 60–74 works but generic/effortful; 40–59 real problems; 0–39 fails its audience. Full labels live in configuration.

**Unresolved policy:** weights/cap/tie-breaker are proposals. Anchors say zero/about half/full, while examples use intermediate points without allocation rules. Current proposed choices permit zero/exact-half/full only. Exact half/rounding, about-two-point usability deductions and per-AI-flag costs need agreement/calibration; no automatic extra deductions. Canonical issue IDs/homes go to SubQ; foreign-home findings abstain, missing ownership fails validation and repeated IDs/results cannot contribute twice. Semantic classification accuracy still needs human calibration.

Nine deal-breakers cover body/large/non-text/placeholder contrast, targets/spacing, focus, color-only signals, feedback and 320px reflow. axe-core 4.14.0 measures body/large text contrast and target size on each frozen capture; the mobile context also measures CSS reflow at 320px (scripts frozen, so script-driven layout is not tested). One measured failure is a verified failure and applies the cap; any node axe cannot resolve (image or gradient background) keeps a pass unknown. Non-text and placeholder contrast, focus, color-only signals and feedback delay have no verifier and stay unknown. Measurements are saved per viewport as a `measurements` evidence artifact. Proposed under 100 ms feedback target differs from under 400 ms deal-breaker. Simplified checks cannot establish full WCAG conformance.

Typography/readability is separate from message clarity; apparent affordances are separate from verified behavior. Adaptation needs matched desktop/mobile from the same run/document/state and does not repeat local overflow/type penalties. AI-isms belong in Originality, not another axis/authorship detector. Credibility means claims presentation, not company trustworthiness. Preserve essential labels/errors/instructions while removing filler.

## Curated checks and evidence ledger

`config/check-registry.json` declares 14 versioned supporting checks: criterion ownership, applicability, required evidence, verifier, issue family, exceptions and source revision. This extension leaves `config/rubric.json` unchanged. Each run saves the registry as a parsed snapshot plus hash in `versions.checks`; reevaluation retains it unless `useLatestChecks: true`. `BETTER_CHECK_REGISTRY_PATH` selects a different candidate registry. Registry rules are copied into the project; no external skills run as dependencies.

`assessment` contains task steps, check observations, six-state coverage, structured findings, reconciliations and verified strengths. Optional `profile.taskSteps` accepts `{id,goal,intendedOutcome}`; the default is the declared core job. Check coverage uses `present`, `partial`, `verified_missing_needed`, `not_applicable` and `unknown`. Missing-and-needed requires verified applicability and runtime absence evidence; non-applicability needs a reason and verified context or an allowed exception. A passwordless flow can exempt password-specific requirements. Partial/unknown coverage cannot become a passing or failing verdict. Not visible in a still never proves unimplemented.

Default, empty, loading, partial, error and success states are ledger entries, not instructions to manufacture states. A partial evaluation retains useful evidence; a failed run means both captures failed. Public static captures cannot establish task completion, response time, keyboard operation or motion. Unconnected checks stay unknown with required/missing evidence. The local benchmark supplies bounded runtime observations for its authored pages only. Visual task clarity and branding candidates await judgment; no invented oracle scores them.

Findings keep severity apart from points/confidence and observations apart from impact hypotheses. Registry issue families plus subject/task/viewport identify overlaps; connected verifiers can supply `underlyingDefectId` to link different checks. Aligned/complementary findings share a defect identity; contradictory homes, observations or explicit fix conflicts remain for human review. No extra per-check deductions are applied. A verified failure contradicting a visual full-points anchor holds that criterion unknown for review while retaining the original judgment. Verified operation/accessibility failures cannot be erased by taste. Semantic duplicate identification still needs calibration or a trusted verifier; matching arbitrary wording is not claimed.

The visual judge receives the brief and page evidence before measured-check results, without accumulated detector counts. Product specificity is judged against audience, desired feeling and core job. Selected-fix prompts include only selected grounded findings plus a short preservation list; unresolved tradeoffs block implementation prompts. Better scores do not establish conversion or satisfaction gains.

Better’s fingerprint keeps all ten criteria. A native keyboard/pointer disclosure exposes a readable exact-value table, explicit unknowns and textual changes for compatible runs. Detailed ledger/findings remain disclosed on demand.

## API

Local routes are not shared C1–C5 implementations. Types: `src/domain.ts`; routes/validation: `src/app.ts`.

| Call | Input / result |
|---|---|
| `GET /api/health` | Mode, paid-call gate, capture busy state |
| `GET /api/rubric` | Current configurable proposed rubric |
| `GET /api/check-registry` | Current curated supporting-check registry |
| `GET /api/projects` | Saved projects |
| `POST /api/projects` | `{name,url,profile:{version,audience,feeling,task,taste,avoid,brand}}`; taste/avoid/brand may be empty; or `{name,demo:true}` with authored brief |
| `GET /api/projects/:id` | Project and chronological immutable runs |
| `POST /api/projects/:id/runs` | `{}` retains snapshot; optional profile/useLatestRubric/useLatestChecks/buildLabel/expectedText; demo supports baseline/revised demoVersion |
| `GET /api/runs/:id` | Run, saved handoffs/selections/corrections |
| `GET /api/runs/:id/evidence/:evidenceId` | Integrity-checked attachment; encode evidence ID |
| `GET /api/runs/:current/compare/:baseline` | Compatibility, per-viewport/criterion deltas and failures |
| `POST /api/runs/:id/handoffs` | `{selectedIds:[...]}`; selected-only prompt/deferred snapshot |
| `POST /api/runs/:id/corrections` | `{criterionId,viewport,note}`; append-only annotation |

Writes require JSON. One bounded synchronous capture; overlap returns 409. Runs may be partial/failed/setup-needed without fabricated scores. A run is `complete` when both captures succeeded and all ten points criteria were assessed; supporting checks without a verifier do not make it partial. Capture degrades rather than fails on subresource 404s, blocked beacons, undecodable images and pages over 12,000px (full-page image clipped and flagged). `quality` drives the fingerprint; combined `axes` mirrors points. Historical ordinal snapshots retain original semantics. `fixtureAxes` is sample-only, excluded from real totals.

## Providers and evidence

Default `BETTER_JUDGE=fixture` uses authored decisions only on the controlled demo. Public sites never receive fixture scores. The demo has authored SAMPLE point choices for all ten criteria, summarized in `fixtureQuality` (never in `quality`) and labeled in the UI. Real captures, measurements and deterministic checks still run. Public visual judgment requires an authorized live provider. Flow, Interaction and Usability points are scored from static evidence (a proposal pending Elle); their behavioral checks stay unknown, so a live judge can produce a full total.

SubQ uses documented `POST /v1/systemone`, configurable `subq-snap-1.1`, plain base64 PNG and bounded choices/abstention. Live calls require `BETTER_JUDGE=subq`, `SUBQ_API_KEY`, `BETTER_ALLOW_PAID_CALLS=true`. Key alone never enables spending. Paid calls are approved by the operator; still opt in per environment. Keep secrets server-side; never commit them. Model access/billing/accuracy remain unverified. Errors sanitized; no paid retries.

Fresh Chromium uses no host cookies/credentials. DNS-pinned public-only GET relay checks redirects/resources, backed by denying proxy. Private/reserved targets, writes, service workers and WebSockets blocked. Readiness requires successful HTML, idle network, ready fonts/images and optional marker. Scripts/animations/media freeze before extraction; document identity checked around capture. Budget: 160 requests, 32 MiB, 12,000 px height. Default state is not interactive/temporal proof.

Each viewport saves viewport/full-page PNG, rendered DOM, sampled styles/geometry and text with hashes/dimensions. DOM downloads are text attachments, never executed or called original source. Model inputs omit scripts/cookies/input values. Motion stays unassessed without video; no video judging. Personality, actual-site generated previews and pairwise tournaments deferred; pairwise rules are disabled metadata. Not wired: Juan’s app, C1–C5, Supabase, deployment, runtime/contrast/320px verification and human calibration.

## Verification

```sh
npm test
npm run lint
npm run build
npm run test:e2e
npm run test:ui
npm run test:benchmark
```

Temporary stores/mocked model transports. Legacy built API E2E uses real Chromium for paired evidence, selected prompts, comparison, failed captures and restart persistence. New built UI test drives brief validation, real paired capture, unknown-safe output, selected handoff, reevaluation/history and desktop/360/400px layouts. Synthetic chart inputs test geometry only, never saved runs. Screenshots stay in ignored `test-results/`. No claim of live SubQ accuracy/full accessibility conformance.

The six paired benchmark candidates cover essential clipping/disclosure, long names/URLs at 360px and 200% authored text size, intentional branding/unrelated styling, inert/operating controls, value-preserving error recovery and partial results. `test:benchmark` saves real Chromium assertions, DOM/style/runtime records and screenshots under ignored `test-results/benchmark/`. These are authored calibration candidates, not validated ground truth or provider accuracy evidence. Unit tests cover applicability, unknown evidence, exceptions, conflict handling and defect deduplication. Built UI checks also prove frozen registry versions, partial/failed separation, persisted history, exact zero values, keyboard/pointer disclosure parity and expanded-table fit at 360/400px.
