# Better evaluation harness

Local, single-operator baseline for capturing a website, evaluating evidence, saving immutable runs, and preparing selected fixes. Product UI is owned by Juan and is outside this workstream. The Google source document and the user's scoring clarifications govern this implementation; conflicting preview proposals in the draft PRD are deferred.

## Run

Node 24+ with SQLite support is required. From this directory:

```sh
npm ci
npx playwright install chromium
npm run build
npm start
```

Server: `http://127.0.0.1:3000`. Keep it on loopback. This is not an authenticated hosted service. SQLite and captured evidence live in `data/` (ignored by Git). Set `BETTER_DATA_DIR` to another persistent local directory if needed. Keep that entire directory when restarting.

`npm run demo` exercises the running API with a controlled real HTML page, captures desktop/mobile, selects one measured fix, saves a handoff and captures a revised page. It prints IDs and comparison results, and saves the selected prompt under `data/demo-prompt.md`. No paid calls are needed.

## API checkpoint for Juan

These `/api` routes are the local harness interface, **not an implementation of TEAM C2–C5**. No `/contracts` schemas exist at this checkpoint. Do not treat this as an approved replacement for the proposed shared contract. Types live in `src/domain.ts`; validation and routing live in `src/app.ts`.

| Call | Body / result |
|---|---|
| `GET /api/health` | Mode, paid-call gate, capture busy state |
| `GET /api/rubric` | Current provisional rubric |
| `POST /api/projects` | `{ "name": "Demo", "demo": true }`, or `{ "name": "Site", "url": "https://example.com" }`; returns project |
| `GET /api/projects/:id` | Project plus immutable chronological runs |
| `POST /api/projects/:id/runs` | `{}` retains previous profile/rubric; optional `buildLabel`, `expectedText`, `profile`, `useLatestRubric`; demo supports `demoVersion: "baseline" | "revised"` |
| `GET /api/runs/:id` | Run, saved handoffs/selections, human corrections |
| `GET /api/runs/:id/evidence/:evidenceId` | Integrity-checked attachment; encode evidence ID with `encodeURIComponent` |
| `GET /api/runs/:current/compare/:baseline` | Compatibility reasons, per-viewport/criterion deltas and explicit failures |
| `POST /api/runs/:id/handoffs` | `{ "selectedIds": ["..."] }`; one prompt plus selected/deferred snapshot |
| `POST /api/runs/:id/corrections` | `{ "criterionId": "TYPE-02", "viewport": "mobile", "note": "..." }`; append-only annotation |

Writes require `Content-Type: application/json`. Captures are synchronous and bounded; one runs at a time, with 409 for overlap. This avoids a pretend background queue. A `partial` run is expected when motion, runtime behavior or other required evidence is unavailable. A failed capture never produces a passing result. `setup_needed` means the selected real provider needs credentials/paid-call approval, or a public site has no real judge configured. Public sites never receive fabricated fixture judgments.

`axes` contains measured/real-judge aggregates only. `fixtureAxes` contains sample-only aggregates. Both are viewport-specific. Null/incomplete axes must remain gaps in a chart. `results` preserves individual criterion statuses, coverage, provenance and evidence references. No cross-device overall score is supplied. Suggestions from fixtures carry `provenance: "fixture"`; label them SAMPLE DATA. Expected effects are hypotheses; only new evaluations produce deltas.

## Rubric and scoring boundaries

`config/rubric.json` is a **provisional harness fixture based on the document**, not Elle's approved `/rubric/rubric.json` or C1 contract. Edit definitions, weights, anchors and thresholds there; each run stores the complete rubric and a content hash. Reevaluations retain that snapshot unless `useLatestRubric` is true. Profiles are editable through a run request and snapshotted; no old result is overwritten. Changing content with the same version label still makes runs incomparable.

- TYPE-01 measures text-size readability; TYPE-02 judges message clarity and redundant filler. Essential labels, errors and instructions must be preserved.
- INT-01 judges apparent affordances. INT-02 abstains until a real interaction verifier exists.
- ADAPT-01 requires desktop/mobile from the same run, served document and state. Overflow/type defects stay in LAY/TYPE, not ADAPT.
- FIT-01 judges presentation of claims and credibility, not actual trustworthiness or factual truth.
- Motion has no connected verifier and stays unassessed. Static SubQ images cannot establish animation quality; no video judging is implemented.
- AI-isms is a separate extension lane, not an authorship detector. Personality mode, actual-site previews and reference evaluation are deferred.

The baseline's exact checks cover document overflow, sampled visible font sizes and image-alt presence. They do **not** establish full typography, contrast, accessibility or interaction compliance. Axis scores summarize configured assessed criteria only. Provisional lower weighted median preserves ordinal anchors. Missing required criteria keep an axis incomplete; mobile failures remain visible.

## Providers and credentials

Default `BETTER_JUDGE=fixture` uses authored decisions only on the controlled demo. Real capture and deterministic measurements still run. Fixture scores include flat values and a craft regression to exercise honest comparison.

SubQ adapter: `src/judges/subq.ts`. [Official Decisions API](https://docs.subq.ai/endpoints/decisions-api/) and [model catalog](https://docs.subq.ai/using-the-api/models/) checked November 7, 2026. It uses `POST /v1/systemone`, model `subq-snap-1.1`, PNG images as plain base64 and bounded choice outputs. Choice permits anchored ordinals plus abstention; no generated prose is assumed. The score API's zero-based weighted values are not treated as ordinal ratings.

Live calls require **both** `SUBQ_API_KEY` and `BETTER_ALLOW_PAID_CALLS=true`, with `BETTER_JUDGE=subq`. Keep secrets server-side in the operator's environment/secret manager; `.env.example` contains no secrets. Supplying a key alone never enables spending. No paid SubQ call or billing change was authorized or used during this build. Model access, billing, automatic charging and real rubric accuracy remain unverified. Decision retention follows [SubQ policy](https://docs.subq.ai/using-the-api/data-retention/); no undocumented `store:false` is sent.

The adapter validates answer types, ranges, option IDs, evidence IDs and contradictions. Errors record sanitized categories, not provider response bodies. It makes one attempt per criterion; no automatic paid retries.

## Capture and evidence limits

Fresh Chromium contexts use no host cookies or credentials. HTTP resources pass a GET-only relay that checks all resolved addresses and pins the checked IP to the connection. Redirects pass the same guard. Private/reserved/metadata addresses, nonstandard ports, writes, service workers and WebSockets are blocked. A denying browser proxy backs up interception. The controlled demo uses request fulfillment, not a loopback-network exception.

Readiness requires successful HTML, idle network, loaded fonts/images and optional expected text. Required resource failures invalidate capture. Scripts, CSS animation and media are frozen before screenshot/DOM/style/text capture; DOM is checked again afterward. Metadata records policy, browser, OS, modality, dimensions, time, state, content hash and artifact checksums. Captures are bounded to 160 requests, 32 MiB relayed bytes and 12,000px height. This is a conservative default-state capture, not evidence of interactive or temporal behavior. Canvas/video state and unusual network protocols warrant isolated infrastructure before public hosting.

Saved HTML is rendered DOM, **not original repository source**. Downloads use attachment disposition, plain text and a restrictive content policy. Model requests contain selected rendered facts/text and screenshots, not raw scripts, cookies, private repositories or input values. Treat all captured content as untrusted. Avoid submitting URLs containing secrets or private data.

## Integration seams and verification

Built/local caller: HTTP routes → capture → deterministic checks / judge → validation → explanations → separate aggregates → SQLite. Handoff and correction APIs are exercised through the same server. No website changes or external messages are sent.

**Not wired:** Juan's Next.js client, shared C1–C5 schemas, Supabase rows/storage/realtime, deployment, live SubQ account execution, motion/runtime verifiers and human calibration. This local store is a development baseline, not a claim that Supabase integration works. Shared schema approval and access are needed before implementing that seam. Prompt assembly here is a tested harness utility; Juan remains owner of the product's final assembly UI.

```sh
npm test
npm run lint
npm run build
npm run test:e2e
```

Tests use temporary state directories and fake model transports; the end-to-end test launches the built server and real Chromium. Test artifacts stay under ignored `test-results/`. No credentials or captured customer content belongs in fixtures or commits.
