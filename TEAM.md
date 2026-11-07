# Better — Team, Contracts & Working Agreement

> **Every human and AI agent working on this repo must read this file and [`PRD.md`](./PRD.md) before making changes.**
> This doc is expected to grow. Keep sections in place and append rather than rewrite.
> Last updated: 2026-11-07 by Juan Camilo (via agent).

---

## 0. How to use this document

- **Humans:** read §1–§4 for the big picture and §6 for what's expected of you. Use §10 (open questions) and §12 (feedback inbox) to talk to the other workstreams.
- **AI agents:** follow the **Agent Protocol (§8)** strictly. Before every task, check §5 (contracts), §9 (decision log) and §10 (open questions).
- **Source-of-truth order:** interface contracts in `/contracts` (once they exist) > this file > `PRD.md` > anything else. If two sources disagree, flag it in §10. Don't guess.

---

## 1. Team & roles

| Person | GitHub | Role | Owns (folders) | Decides on | Consumes from others |
|---|---|---|---|---|---|
| **Juan Camilo** | `@juancamilo994` | System scaffolding, product experience | `/apps/web` (shared with Elle), `/supabase`, `/contracts` (steward), root docs | Web stack, DB schema, prompt assembly, repo conventions | Rubric (Elle), UI/visual design direction (Elle), evaluation results and previews (Paul) |
| **Paul** | `@laulpogan` | Harness: captures and evaluates the website's UI | `/harness` | Harness language and runtime, LLM provider(s) and models, hosting, capture and preview strategy, recommendation generation | Rubric (Elle), evaluation requests and DB/storage access (Juan) |
| **Elle** | `@elle-mcdougald` | Rubric + UI/visual design | `/rubric`, `/design`, `/apps/web` UI layer (shared with Juan) | Axes, criteria, scale, anchors, weights, overall formula, evidence requirements, fix patterns; **visual system, Paper file, tokens, components — she may replace anything in the UI** | Feedback from Paul (what's measurable) and Juan (what's presentable); product flow & data wiring (Juan) |
| **yitzybitzyspider** | `@yitzybitzyspider` | Rubric testing & the Motion section (helping Elle) | — (contributes to `/rubric` via PRs to Elle) | Motion criteria and rubric test proposals (final call stays with Elle) | Rubric conventions and review (Elle); motion evidence capabilities (Paul) |

**Ownership rule:** you can *read* everything, but you only *change* files in folders you own. Anything else goes through a PR approved by the owner. Shared contracts (§5) need approval from **every affected owner**.

---

## 2. Repo layout (target)

```
/
├── PRD.md                     # Product requirements (Juan)
├── TEAM.md                    # This file (everyone appends; Juan curates)
├── DESIGN.md                  # Visual system + Paper handoff (Elle)
├── README.md
├── Placeholder rubric.md      # Elle's draft. To be moved to /rubric/rubric.md
├── apps/
│   └── web/                   # Next.js web app (Juan + Elle — UI layer is Elle's)
├── harness/                   # Evaluation and preview service (Paul)
├── rubric/                    # Elle
│   ├── rubric.md              #   human-readable rubric with rationale
│   └── rubric.json            #   machine-readable rubric (contract C1)
├── contracts/                 # Shared interfaces (all three, Juan stewards)
│   ├── schemas/               #   JSON Schemas: rubric, evaluation-result, preview, harness-api
│   ├── fixtures/              #   sample payloads for mock mode and tests
│   └── CHANGELOG.md
├── supabase/                  # migrations, seed (demo project) (Juan; Paul reviews)
├── design/                    # Paper exports, screenshots, design notes (Elle)
└── .github/CODEOWNERS
```

---

## 3. Architecture at a glance

Full details are in [PRD §9](./PRD.md#9-system-architecture-v1).

> **MVP (decided 2026-11-07): everything runs locally on one machine.** The harness is a local, loopback-only service (`harness/README.md`, default `http://127.0.0.1:3000`) and is the **source of truth** for projects, runs, comparisons and handoffs (SQLite + disk). The web app (Next.js, port **3001**) calls the harness's `/api` from its server routes. Calls are synchronous: one capture at a time, and the result returns when done. **Supabase, Vercel hosting, Realtime progress and C2–C5 below are deferred to post-MVP.** C1 (rubric) still applies, made flexible (see §5 C1 note).

Target architecture (post-MVP):

1. **Web app** (Next.js on Vercel) creates projects and evaluations in **Supabase** and calls the **Harness** over HTTPS.
2. **Harness** (a separate, long-running service) loads the URL in a headless browser, captures evidence, scores it against the **rubric**, generates recommendations with declarative patches, and renders before/after previews. It writes status and results to Supabase and uploads images to Supabase Storage.
3. **Web app** subscribes to Supabase Realtime for progress and results, renders Views 1–5 and assembles the final prompt.
4. **Rubric** (`rubric/rubric.json`) is read by **both** the harness (what to score) and the web app (labels, icons, explainers, scale).

---

## 4. Locked decisions vs. delegated decisions

| Topic | Status | Owner |
|---|---|---|
| No auth, no profiles in V1 | **Locked** | — |
| One URL (single page) per project | **Locked** | — |
| Live previews: approach **owned by Paul**. Juan proposes hybrid (real patches in headless browser + Illustrative fallback); Paul decides hybrid / illustrative-only / tutorial-only | **Delegated**: awaiting Paul (see §12.1) | Paul |
| Patches are **declarative** (CSS + whitelisted DOM ops), no arbitrary JS | **Proposed**: Paul to confirm | Paul |
| **MVP runs locally** on one machine; harness `/api` + SQLite is the source of truth | **Locked** (2026-11-07) | Paul + Juan |
| Persistence: **Supabase** (Postgres + Storage + Realtime) | **Deferred** to post-MVP | Juan |
| Web: Next.js (App Router) + TS + Tailwind + Framer Motion. Local for MVP (port 3001); Vercel post-MVP | **Locked** | Juan |
| Harness: Node 24 + TS + Playwright + Express, local, loopback-only | **Decided** by Paul | Paul |
| LLM provider(s) and models: SubQ `subq-snap-1.1` today; **paid models are approved**, provider choice is Paul's | **Delegated** | Paul |
| **Overall score = sum of criterion points** (weights total 100), per viewport, deterministic; Elle's Combined rubric adds score bands + a deal-breaker cap (verified failure caps at 49) | **Locked** (2026-11-07; superseded same day by the Combined rubric adopted by Paul) | Juan + Elle |
| Generic fix text (pre-written per rubric finding) is acceptable. If a fix appears, the issue was detected on the design | **Locked** (2026-11-07) | — |
| Fewer than 3 fixes per axis is acceptable | **Locked** (2026-11-07) | — |
| Rubric lives **in the repo** under `/rubric` (not Google Docs); the harness loads it from there | **Locked** (2026-11-07) | Elle |
| Scale, anchors, weights | **Delegated** (placeholder: 1–4 ordinal) | Elle |
| Async pattern: harness writes status/results to Supabase; web subscribes | **Deferred** to post-MVP (synchronous local calls for MVP) | Paul + Juan |
| Previews rendered eagerly after scoring (not only on click) | **Proposed**: depends on Paul's preview decision | Paul |
| Git: branches + PRs, folder ownership via CODEOWNERS | **Locked** | — |
| Max 3 fixes per run: **soft cap** with warning | **Locked** | Juan |

---

## 5. Interface contracts

These are the seams where our work meets. **They matter more than any single implementation.**
The notation below is TypeScript-style for readability only; it does **not** imply the harness must be TS. Once agreed (milestone M1), each contract becomes a JSON Schema in `/contracts/schemas` with fixtures in `/contracts/fixtures`, and that file becomes the source of truth.

Every contract is **versioned** (semver). Breaking changes bump the major version and need sign-off from all affected owners (see §7.4).

> **MVP status (2026-11-07):** for the local MVP, **C2–C5 are superseded by the harness's local `/api`** (documented in `harness/README.md`, types in `harness/src/domain.ts`). They remain the post-MVP target. **C1 stays**, but must be **flexible**: the harness validates only the fields it needs and passes everything else through. Elle can then add UI fields (`shortName`, `icon`, `summary`, `whatMatters`, …) without breaking the harness, and axes and the scale come from the file rather than code. Overall score for MVP = **sum of axis scores** (see §4).

### C1 — Rubric (`rubric/rubric.json`) · Producer: Elle · Consumers: Paul, Juan

```ts
interface Rubric {
  version: string;                    // "0.1.0". Stamped on every evaluation.
  scale: {
    min: number; max: number; step: number;            // placeholder: 1, 4, 1
    anchors: { value: number; label: string; description: string }[];
    notAssessed: true;                // criteria may be null = "not assessed"
  };
  overall: {
    method: "weighted_normalized";    // Elle may define others
    displayMax: number;               // e.g. 100
    description: string;              // shown in UI "How is this calculated?"
  };
  axes: Axis[];                       // order = order on the spider chart
  taste?: unknown;                    // TBD: "taste channel" (see §10, Q-E3)
}

interface Axis {
  id: string;                         // stable slug, e.g. "hierarchy". NEVER rename once used.
  code: string;                       // e.g. "HIER"
  name: string;                       // "Hierarchy & wayfinding"
  shortName: string;                  // ≤ 12 chars, for chart labels: "Hierarchy"
  icon: string;                       // Lucide icon name, e.g. "compass" (UI uses on compact chart)
  weight: number;                     // default 1
  summary: string;                    // one sentence, user-facing
  whatMatters: string[];              // 3–5 bullets for the axis explainer (View 3)
  scope: { includes: string[]; excludes: string[] };   // single-home rule, prevents double counting
  evidence: EvidenceType[];           // what the harness MUST capture to score this axis
  criteria: Criterion[];
  fixPatterns?: { id: string; title: string; description: string; example?: string }[];
}

interface Criterion {
  id: string;                         // e.g. "hierarchy.primary_action"
  name: string;
  description: string;
  anchors: Record<string, string>;    // keyed by scale value: { "1": "...", "2": "...", ... }
  observableExamples: string[];       // what to look for
  evidence: EvidenceType[];
}

type EvidenceType =
  | "desktop_screenshot" | "mobile_screenshot" | "dom" | "accessibility_tree"
  | "computed_styles" | "contrast_measurement" | "interaction_probe" | "recording";
```

### C2 — Harness HTTP API · Producer: Paul · Consumer: Juan (web server)

All requests use `Authorization: Bearer ${HARNESS_SHARED_SECRET}`. JSON in, JSON out.

| Method & path | Body | Response | Behavior |
|---|---|---|---|
| `GET /healthz` | — | `200 { ok, harnessVersion, rubricVersions[] }` | Liveness check |
| `POST /v1/evaluations` | `EvaluationRequest` | `202 { evaluationId }` | Starts async job. Harness updates the `evaluations` row through its lifecycle. |
| `POST /v1/previews` | `{ evaluationId, recommendationId }` | `202 { previewId }` | (Re-)renders a single preview. Normally previews are rendered automatically after scoring. |

```ts
interface EvaluationRequest {
  evaluationId: string;   // row already created by web app with status "queued"
  projectId: string;
  url: string;
  rubricVersion: string;
  context: {
    projectName: string;
    description: string;                                  // from onboarding
    onboarding: { decisions: { cardId: string; label: string; liked: boolean }[] };  // FPO
    previousEvaluationId?: string;                        // for no-change detection / diffs
  };
}
```

**Status lifecycle** (written by the harness to `evaluations.status` + `evaluations.progress`):
`queued → capturing → evaluating → recommending → rendering_previews → succeeded` (or `failed` at any step with `error: { code, message }`).
The UI shows scores once `recommending` starts. **`result` must contain `overall` + `axes` before status passes `evaluating`.** This lets the score show early.

Error codes (initial): `URL_UNREACHABLE`, `BLOCKED`, `TIMEOUT`, `RENDER_FAILED`, `LLM_FAILED`, `INTERNAL`.

### C3 — Evaluation result (`evaluations.result` jsonb) · Producer: Paul · Consumer: Juan

```ts
interface EvaluationResult {
  evaluationId: string;
  rubricVersion: string;
  harnessVersion: string;
  models: string[];                   // models used, for reproducibility
  capturedAt: string;                 // ISO
  pageFingerprint: string;            // stable hash of rendered page; same page ⇒ same hash
  captures: {
    viewport: "desktop" | "mobile";
    width: number; height: number;
    viewportPath: string;             // Supabase Storage path
    fullPagePath: string;
  }[];
  overall: { score: number; max: number };            // normalized per rubric.overall
  axes: AxisResult[];                 // one per rubric axis, same ids
  recommendations: Recommendation[];
}

interface AxisResult {
  axisId: string;                     // == Rubric.axes[].id
  score: number | null;               // null = not assessed
  max: number;
  confidence: "low" | "medium" | "high";
  summary: string;                    // 1–2 user-facing sentences
  limitations: string[];              // e.g. "Motion not assessed: no recording"
  criteria: {
    criterionId: string;
    score: number | null;
    rationale: string;
    evidence: Evidence[];
  }[];
}

interface Evidence {
  viewport: "desktop" | "mobile";
  note: string;
  selector?: string;
  bbox?: { x: number; y: number; width: number; height: number };   // page coords, CSS px
  measured?: Record<string, number | string>;                       // e.g. { contrastRatio: 2.8 }
}

interface Recommendation {
  id: string;                         // unique within evaluation
  axisId: string;
  criterionIds: string[];
  rank: number;                       // 1 = best within its axis; UI shows ranks 1–3
  title: string;                      // ≤ 60 chars, imperative: "Make the primary CTA stand out"
  problem: string;                    // one sentence
  proposal: string;                   // what changes, plain language
  expectedImpact: { axisDelta: number; confidence: "low" | "medium" | "high" };
  effort: "S" | "M" | "L";
  target: {
    viewport: "desktop" | "mobile";
    description: string;              // human: "Primary button in the hero section"
    selector?: string;
    bbox?: { x: number; y: number; width: number; height: number };
  };
  patch: Patch | null;                // null ⇒ preview will be Illustrative
  promptSnippet: string;              // Markdown, agent-ready: What / Where / Why / Acceptance criteria
}

interface Patch {
  css?: string;                       // scoped CSS injected as a <style> tag
  ops?: DomOp[];
}

type DomOp =
  | { op: "setText";  selector: string; value: string }
  | { op: "hide";     selector: string }
  | { op: "remove";   selector: string }
  | { op: "setStyle"; selector: string; style: Record<string, string> }
  | { op: "setAttr";  selector: string; name: string; value: string }
  | { op: "addClass"; selector: string; className: string }
  | { op: "move";     selector: string; targetSelector: string;
      position: "before" | "after" | "prepend" | "append" };
```

**Recommendation guarantees:** up to 3 recommendations per axis in rank order. Fewer is fine if the axis is already strong; zero means the UI shows "Nothing major to fix here".

### C4 — Preview (`previews` row) · Producer: Paul · Consumer: Juan

```ts
interface Preview {
  id: string;
  evaluationId: string;
  recommendationId: string;
  status: "pending" | "rendering" | "ready" | "failed";
  mode: "live" | "illustrative";
  viewport: "desktop" | "mobile";
  before: { fullPath: string; cropPath: string; crop: BBox };
  after?: { fullPath: string; cropPath: string; crop: BBox };    // absent when illustrative
  annotations?: { bbox: BBox; label: string }[];                  // used by illustrative mode
  diffRatio?: number;                                             // 0–1 pixel diff in crop
  failureReason?: string;                                         // why it fell back
}
```

Rule: a preview is `live` **only if** every patch selector matched **and** `diffRatio` > a threshold (Paul defines). Otherwise it is `illustrative`.

### C5 — Database & Storage access · Producer: Juan · Consumer: Paul

- Juan owns `/supabase/migrations`. Schema in [PRD §10](./PRD.md#10-data-model-draft--juan-owns-paul-reviews).
- **The harness may write only** to: `evaluations.{status, progress, result, overall_score, page_fingerprint, error, completed_at}`, `previews.*`, and Storage bucket `captures/`. Everything else is read-only for the harness.
- The harness uses the Supabase **service-role key** (server-side only). The web app uses it only in server code.
- Storage path convention: `captures/{projectId}/{evaluationId}/{viewport}-{viewport|full}.png` and `captures/{projectId}/{evaluationId}/previews/{recommendationId}-{before|after}[-crop].png`.

### C6 — Prompt assembly · Producer: Juan · Inputs from Paul (snippets) and Elle (criteria wording)

The web app builds the final prompt deterministically. Template:

```md
# Improve the UI of {projectName} ({url})
Context: {description}

Apply ONLY the following {n} changes. Do not modify unrelated UI, content, or behavior.
Keep the existing design system (colors, fonts, components) unless a change says otherwise.

## 1. {title}  ({axis name})
{promptSnippet}

## 2. ...

When done, verify each acceptance criterion above.
```

---

## 6. Expectations per role

### Paul — Harness

**You can rely on:**
- `rubric/rubric.json` conforming to C1, versioned. Rubric changes come with a CHANGELOG entry.
- An `evaluations` row in `queued` state existing before Juan calls `POST /v1/evaluations`.
- Supabase project, keys and the `captures` bucket provisioned by Juan. Credentials are shared out-of-band, never committed.

**We need from you:**
1. **Confirm or push back** on the proposed items in §4 and on contracts C2–C4 (use §12).
2. Pick the stack, LLM provider and hosting, then record them in §9.
3. **M1:** a deployed or locally runnable stub that accepts `POST /v1/evaluations` and writes a fixture result through the status lifecycle. This unblocks end-to-end wiring early.
4. **M2–M3:** real capture (desktop + mobile), scoring against the rubric, recommendations with declarative patches, Live previews with the Illustrative fallback.
5. Reproducibility: pin the model and settings; same page ⇒ same `pageFingerprint` and stable scores.
6. Security: SSRF protection, timeouts, page-size limits.
7. Document how to run the harness locally in `/harness/README.md`, including its env vars.

**Definition of done:** the fixture-equivalent output for a real URL validates against the JSON Schemas in `/contracts/schemas`.

### Elle — Rubric

**You can rely on:**
- The UI rendering whatever axes, scale, weights, names, icons and explainer copy are in `rubric.json`. Nothing is hard-coded in the UI.
- The harness reporting `null` / "not assessed" rather than guessing when evidence is missing.

**We need from you:**
1. Move `Placeholder rubric.md` to `rubric/rubric.md` and keep it as the human-readable rationale.
2. **M1:** `rubric/rubric.json` v0.1 conforming to C1, with all 8 axes: `id`, `code`, `name`, `shortName` (≤ 12 chars), `icon` (Lucide name), `weight`, `summary`, `whatMatters`, `scope`, `evidence`, and at least 2 criteria each.
3. Decide the **scale** and **overall formula** (open questions Q-E1, Q-E2), including how ordinal 1–4 criterion scores roll up into an axis score (mean? median? min?).
4. **M2:** per-criterion anchors (one line per scale value), observable examples and evidence requirements. Paul needs these to write the evaluator prompts.
5. **M3:** `fixPatterns` per axis, meaning common, concrete fixes. These seed recommendation quality and Illustrative fallbacks.
6. Calibration: score 2–3 reference sites by hand so Paul can compare harness output against human judgment.

**Definition of done:** `rubric.json` validates against the C1 schema, and Paul confirms every criterion is measurable with the declared evidence.

### Elle — UI & visual design (added 2026-11-07)

**You can rely on:**
- The Paper file "Better — App UI" and `DESIGN.md` as the recorded starting direction ("The Wall", nocturnal marquee) — a starting point, **not a lock**. You may replace anything in the UI: tokens, type, layout, components, whole views.
- Juan's wiring underneath: server routes → harness `/api`, run data, prompt assembly (C6), the `fixtureQuality`/`SAMPLE` plumbing. Visual changes are yours; if a data need changes, flag it via §7.4 or §12 rather than reshaping payloads yourself.
- The honesty rules in `DESIGN.md` are product commitments, not styling: LIVE vs ILLUSTRATIVE labels, unassessed-as-gaps, estimates marked as estimates. Change the look freely — keep (or deliberately change) the semantics.
- Rubric-driven UI rule stays (§8.4): axes, names, icons, scale come from `rubric.json`, never hard-coded.

**We need from you:**
1. Own `/design` and the UI layer of `/apps/web`: tokens (`globals.css` `@theme`), components, view implementations for Views 1–5.
2. Keep `DESIGN.md` and the Paper file current as you change the system — they are the team's visual source of truth.
3. Missing pieces to design/extend: responsive/mobile frames, empty/loading/error states, motion spec (Framer Motion is the stack).

### yitzybitzyspider — Rubric Motion & testing

**You can rely on:**
- Elle owning `/rubric` and the final calls on axes, scale and wording. Your work lands through PRs she approves (§1 ownership rule).
- Paul for what motion evidence the harness can actually capture (recordings, temporal probes). Per Q-P6, motion currently abstains without evidence.

**We need from you:**
1. Draft the **Motion** part of the rubric: criteria, anchors, observable examples and evidence requirements. Placement (dedicated axis vs. inside INT) is Elle's call; define what evidence turns motion from "not assessed" into scored.
2. Stand up rubric testing: measurability checks on criteria and calibration runs on reference sites, paired with Elle's calibration task.
3. Keep everything C1-compatible; flag contract needs via §7.4 instead of inventing fields.

### Juan Camilo — Scaffolding, UX, UI

**We will deliver:**
1. Repo skeleton, CODEOWNERS, `/contracts` JSON Schemas + fixtures (M1), Supabase schema and migrations, the demo project seed.
2. Paper designs for Views 1–5 (done — "The Wall"; Elle owns the visual system from here), then implementation in `/apps/web` with Elle.
3. Mock mode: the web app runs fully on fixtures, so it never blocks on the harness.
4. Prompt assembly (C6), Realtime status, the re-assess loop and the progression chart.
5. Keep this file and the PRD current. Curate §9–§12.

---

## 7. Working agreements

### 7.1 Branches & PRs
- **Planning phase (now, through M1 contract freeze):** pushing directly to `main` is allowed for planning artifacts only: `PRD.md`, `TEAM.md`, `rubric/`, `contracts/`, design notes. Pull before you push, keep commits small, and append rather than rewrite shared docs.
- **Development phase (from the first implementation code onward):** no direct pushes to `main`. Everything goes through branches and PRs.
- Branch naming: `{person}/{short-topic}`, e.g. `paul/capture-pipeline`, `elle/rubric-v0.1`, `juan/onboarding-swipe`.
- PRs into `main`. Keep them small and focused.
- **Review:** the owner of each touched folder approves (CODEOWNERS). Contract changes need all affected owners. Note: GitHub treats multiple CODEOWNERS on a path as "any one of them". The "all affected owners" rule for contracts is a team agreement, not enforced by GitHub.
- PR description: what / why / how tested / **contracts touched (yes/no)**.

### 7.2 Commits
- Imperative, concise subject (`Add swipe deck animation`). Body explains *why* if it isn't obvious.
- AI-generated commits are fine; the human owner is responsible for what gets merged.

### 7.3 Secrets & environment
- Never commit secrets. Use `.env.local` (git-ignored) and commit a `.env.example` with variable names only.
- Expected variables:

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web (client) | |
| `SUPABASE_SERVICE_ROLE_KEY` | web (server), harness | Never exposed to the browser |
| `HARNESS_URL`, `HARNESS_SHARED_SECRET` | web (server), harness | |
| LLM API keys (names TBD by Paul) | harness only | |
| `BETTER_MOCK_MODE=1` | web | Use fixtures instead of the harness |

### 7.4 Contract change process
1. Open a PR that changes `/contracts/schemas/*` (and fixtures), bumps the version, and adds an entry to `/contracts/CHANGELOG.md`.
2. Label it `contract-change` and tag every affected owner.
3. No implementation may depend on the new contract until it is merged.
4. Non-breaking additions (new optional fields) can be approved by the steward plus the producer.

---

## 8. Agent protocol (for AI coding agents)

If you are an AI agent working on behalf of Juan, Paul or Elle:

1. **Read first:** `TEAM.md` (this file), `PRD.md`, the relevant contracts in `/contracts`, and the README of the folder you're working in.
2. **Know whose agent you are.** Work only in your owner's folders (§1). If a change elsewhere is needed, **don't make it.** Write the request in §12 (Feedback inbox) or open a PR that clearly targets the other owner.
3. **Contracts are law.** Don't invent fields, rename ids or change semantics. If the contract doesn't fit, propose a change via §7.4 and use fixtures meanwhile.
4. **Never hard-code rubric content** (axis names, counts, scales, icons) outside `/rubric`. Read it from `rubric.json`.
5. **No secrets** in code, logs, fixtures or docs.
6. **Log decisions.** When you make a decision others depend on, append it to §9 with date, owner and rationale.
7. **Ask, don't assume.** Put cross-team uncertainties in §10 with the owner tagged. Continue with a clearly marked assumption if you aren't blocked.
8. **Update the status board (§11)** when you start or finish a deliverable.
9. **Append, don't rewrite.** Don't delete other people's entries in this file. Mark them resolved instead.
10. **Stay demo-focused.** Prefer the simplest thing that keeps the end-to-end loop working (see PRD §1.3).

---

## 9. Decision log

| Date | Decision | Owner | Rationale |
|---|---|---|---|
| 2026-11-07 | Hybrid live previews (headless patch + Illustrative fallback) | Juan | Real before/after on the user's own site is the core "wow"; the fallback keeps the demo robust |
| 2026-11-07 | Supabase for DB, Storage, Realtime | Juan | Shared hosted state for the team, image storage, live status streaming |
| 2026-11-07 | Next.js + TS on Vercel for the web app | Juan | Fast iteration, good animation ecosystem, easy hosting |
| 2026-11-07 | Harness stack and LLM provider delegated to Paul | Juan | Harness owner knows the evaluation needs best |
| 2026-11-07 | Scale and overall formula delegated to Elle; UI reads them from `rubric.json` | Juan | The rubric owns semantics; the UI stays generic |
| 2026-11-07 | Branches + PRs, folder ownership via CODEOWNERS | Juan | Clean separation across three parallel workstreams |
| 2026-11-07 | Direct pushes to `main` allowed during the planning phase only; branches + PRs once development starts | Juan | Fast iteration on alignment docs; protect `main` once code lands |
| 2026-11-07 | Harness: Node 24 + TS + Playwright + Express, local loopback service, SQLite store, SubQ judge | Paul | Runnable evidence-bound baseline; see `harness/README.md` |
| 2026-11-07 | **MVP runs locally**: web app calls harness `/api` synchronously; harness is source of truth; Supabase/Vercel/Realtime deferred | Juan | Paul's local harness works today; avoids integration work before the demo |
| 2026-11-07 | **Overall score = sum of axis scores** (per viewport, deterministic, no tokens) | Juan | Simple, explainable, cheap; supersedes the weighted-normalized proposal |
| 2026-11-07 | **Combined rubric adopted**: 10 weighted criteria → /100 total, score bands, 9 deal-breakers with 49 cap, one-issue-one-home catalog; transcribed by Paul from Elle's source doc, weights/cap are Elle's proposals pending calibration | Elle + Paul | Elle's newer source doc supersedes the 8-axis/1–4 placeholder; the sum-based overall survives as weighted points |
| 2026-11-07 | Generic fixes OK; fewer than 3 fixes per axis OK | Juan | A fix only appears if the issue was detected on the design |
| 2026-11-07 | Live preview approach is Paul's decision (hybrid proposed by Juan) | Juan | Paul owns the harness and its feasibility |
| 2026-11-07 | Paid models approved; provider choice is Paul's | Juan | Real evaluations on public URLs need a live judge |
| 2026-11-07 | Rubric source of truth is the repo (`/rubric`), not Google Docs | Juan | Compact, versioned, readable by every agent |
| 2026-11-07 | Paul's UI ideas (`harness/docs/implementation-plan.md`) are input for the Paper mockup stage, not spec | Juan | UI decisions are made in the mockup stage |
| 2026-11-07 | Soft cap of 3 fixes per prompt (warning, not block) | Juan | Keeps score changes attributable without frustrating users |
| 2026-11-07 | Harness-only checkpoint; no actual-site previews, personality mode or video judging | Paul | Explicit user scope; local API and provisional rubric are documented pending shared contracts |
| 2026-11-07 | UI/visual design ownership moves Juan → Elle: `/design`, `DESIGN.md` and the UI layer of `/apps/web` are Elle's; she may replace anything in the UI | Juan | Elle is taking the UI; one owner for visual decisions avoids two cooks. Juan keeps scaffolding, wiring and prompt assembly |

---

## 10. Open questions

| ID | Question | Owner | Status |
|---|---|---|---|
| Q-P1 | Harness language, runtime and hosting (Railway / Fly / Render / local for demo)? | Paul | RESOLVED: Node 24 + TS + Playwright + Express, local only |
| Q-P2 | LLM provider(s) and models; single-pass or multi-sample scoring? | Paul | ANSWERED: SubQ `subq-snap-1.1`, one attempt per criterion. Paid calls now approved; provider is Paul's call |
| Q-P3 | OK with harness writing directly to Supabase (C5) vs. returning results over HTTP? | Paul | RESOLVED: local HTTP + SQLite for MVP; Supabase deferred |
| Q-P4 | OK with declarative patches only (no arbitrary JS)? Any ops missing from `DomOp`? | Paul | Open: depends on preview decision (Q-P7) |
| Q-P5 | Eager preview rendering after scoring: acceptable time and cost for ~24 previews (8 axes × 3)? | Paul | Open: depends on preview decision (Q-P7) |
| Q-P6 | How will INT (interaction states) be evidenced: interaction probes (hover/focus) or Illustrative only for V1? | Paul + Elle | ANSWERED: apparent affordances judged from stills; verified behavior/motion abstain without evidence |
| Q-P7 | Live previews: deferred because tests showed it's harder than expected, or not yet explored? Hybrid vs. illustrative-only vs. tutorial-only? | Paul | Open (see §12.1) |
| Q-P8 | Local API additions for the UI: `DELETE /api/projects/:id`, latest-run summary in `GET /api/projects`, `overall` per viewport on runs | Paul | Open (see §12.1) |
| Q-E1 | Final scale: keep ordinal 1–4? How do criterion scores roll up to an axis score? | Elle | SUPERSEDED by Combined: axis = one weighted points criterion; anchored 0/half/full point choices per criterion |
| Q-E2 | Overall formula and display max? | Elle | RESOLVED: Combined = sum of weighted criterion points /100, bands + deal-breaker cap; intermediate point values still need Elle's calibration (unresolved in rubric) |
| Q-E5 | Combined rubric has no `icon`/`shortName` per axis (needed for the compact chart). Add them to `/rubric`, or UI keeps an icon map keyed by axis id? | Elle + Juan | Open |
| Q-P9 | Demo fixture: judge ratings reference legacy criterion IDs; controlled demo yields all-unknown points under Combined. Add authored point-scores for the demo project, or demo via live SubQ? | Paul | Open (see §12.2) |
| Q-E3 | The rubric mentions a **"taste channel"**: is that the onboarding swipe data? Is it scored separately, shown separately, or ignored in V1? | Elle + Juan | Open |
| Q-E4 | Should any axis be excluded from the overall score in V1 (e.g. ADAPT if mobile capture fails)? | Elle | Open |
| Q-J1 | GitHub handles for Paul and Elle (for CODEOWNERS)? | Juan | RESOLVED: `@laulpogan`, `@elle-mcdougald` |
| Q-J2 | Team chat channel and demo date? | Juan | Open |

---

## 11. Status board

| Owner | Now | Next | Blocked on |
|---|---|---|---|
| Juan | Reviewed Paul's harness (PR #1); MVP decisions logged | Paper designs for Views 1–5, web app scaffold against harness `/api` | Paul's answers on Q-P7, Q-P8 |
| Paul | Combined rubric adopted + wired; native harness UI; 28+ tests pass | Q-P7 preview decision, Q-P8 (DELETE + latest-run), Q-P9 demo scores, paid-judge enablement | — |
| Elle | Placeholder rubric drafted; now owns UI/visual design | `rubric/rubric.json` v0.1, answer Q-E1…Q-E4; review `DESIGN.md`, then Views 1–5 in `/apps/web` | — |
| yitzybitzyspider | Joining | Motion rubric draft + rubric testing, with Elle | Elle's rubric structure (Q-E1) |

Paul update, 2026-11-07: local harness and team handoff are in draft PR #1. 28 tests, lint, typecheck, build and built-server Chromium end-to-end verification passed. Next: agree C1–C5 mapping with Juan and Elle. Full rubric scoring needs live SubQ; a composite needs the approved aggregation rule. Supabase and web UI remain unwired.

---

## 12. Feedback inbox

### 12.1 Juan → Paul: reply to the harness checkpoint (2026-11-07, also posted on PR #1)

Thanks: the scope discipline, evidence/security work and verification (28 tests + Chromium e2e in `9c72c6b`) are excellent. Points 2 and 5 below unblock the two items you flagged as pending ("a composite needs the approved aggregation rule" and "full rubric scoring needs live SubQ"). Decisions and asks:
1. **Live before/after previews: your call, but we need your reasoning (Q-P7).** Did you defer them because tests showed they're harder than expected, or because you haven't explored them yet? My view on the hybrid approach: most of the hard work already exists in your harness: Playwright capture, frozen state, and `ElementFact`s with positions.
   - *Live:* re-open the frozen page, inject scoped CSS plus a few whitelisted DOM ops (`setStyle`, `setText`, `hide`, `move`), screenshot the affected area, and diff the pixels. Above a threshold, mark it **Live**. Otherwise mark it **Illustrative**: the before screenshot plus an annotation box built from facts you already capture.
   - *Fits SubQ's choice-only answers:* let the judge also *choose the target element* from the element facts (as options) alongside the finding. Each finding then maps to a patch template filled in with that element, e.g. raise the contrast or size of the chosen CTA. No free-text generation is needed.
   - *Options:* (a) hybrid, (b) illustrative only, (c) tutorial-style only. You own this; please choose and log it in §9.
2. **The overall score must be present. This is the approved aggregation rule.** Keep it simple: **the sum of the axis scores**, per viewport, computed in code with no model tokens. Suggested shape on each run: `overall: Record<Viewport, { score, max, assessedAxes, totalAxes }>`, with `max` = scale max × number of axes. The UI shows desktop as the headline and mobile alongside it. Unassessed axes stay visible as gaps in the chart.
3. **Generic fixes are fine**, and fewer than 3 per axis is fine. If a fix appears, the issue was detected on the design.
4. **Integration: approved: the MVP runs locally with your model.** The web app (Next.js on port 3001) calls your `/api` from its server routes on `127.0.0.1:3000`. Your store is the source of truth; Supabase is deferred to post-MVP. Onboarding maps to your `profile`: `task`/`audience` from the project description, `taste` = liked card labels, `avoid` = passed card labels. Small additions the UI needs (Q-P8): `DELETE /api/projects/:id` (cascade runs and evidence), a latest-run summary in `GET /api/projects` (status, createdAt, overall per viewport), and `overall` on runs (point 2). Synchronous calls with a spinner are fine for MVP.
5. **Paid models are approved**, so you can enable live SubQ (`BETTER_ALLOW_PAID_CALLS=true`) or switch provider. The provider and model choice is yours.
6. **The rubric is a flexible system; Elle's final version is still coming.** Please don't hard-code it:
   - Load it from `/rubric/rubric.json` (path configurable), and derive the axes and their order from the file rather than the `AXES` constant.
   - Take the scale from the file, with anchors as an array sized to the scale rather than a fixed 4-item list.
   - Validate only the fields the harness needs (`axes[].id/title`; `criteria[].id/axis/channel/lane/instructions/requires/anchors/weight/findings`) and pass unknown fields through, so Elle can add UI fields (`shortName`, `icon`, `summary`, `whatMatters`) without breaking you.
   - Keep your per-run snapshot and hash.
   - Your provisional `config/rubric.json` can be Elle's starting point.
7. **Elle's work lives in the repo** under `/rubric`, not in the Google Doc. It's more compact, versioned, and easy for every agent to manage. Please point the harness and README there.
8. **Your UI ideas** in `harness/docs/implementation-plan.md` are welcome. We'll consider them at the Paper mockup stage; until then please treat them as input, not spec.

### 12.2 Inbox

Append feedback addressed to another workstream. Format: `- [YYYY-MM-DD] from → to: message` (and mark `RESOLVED` when addressed).

- [2026-11-07] Juan → Paul, Elle: please review PRD.md and TEAM.md §4–§6 and add your feedback here or in a PR before we start M1.
- [2026-11-07] Juan → Elle, yitzybitzyspider: welcome @yitzybitzyspider — focusing on testing and the Motion part of the rubric. Elle, please onboard him on rubric conventions; his `/rubric` changes land via PRs to you.

- [2026-11-07] Paul → Juan, Elle: Harness checkpoint is on `feat/better-evaluation-loop` under `/harness`; see `harness/README.md` for local API and setup. User narrowed this work to the eval harness and explicitly deferred actual-site previews, personality mode and video judging. SubQ is a structured choice judge; fixture decisions stay labeled and separate from real measurements. TYPE readability/message clarity and INT appearance/verified behavior are separate criteria; ADAPT requires matched captures and does not repeat viewport-local penalties; FIT assesses claim presentation, not company truthfulness.
- [2026-11-07] Paul → Juan: Q-P1/P2: Node 24+, TypeScript, Playwright, Express; local demo, SubQ `subq-snap-1.1` adapter with paid calls disabled. Q-P3: local SQLite is the runnable development baseline; Supabase C5 and the C2 async lifecycle are not wired or claimed compatible. `/contracts` and provisioned access were absent when work began. Please coordinate the shared seam before connecting the UI; `/api` is a documented local API, not a silent C2 replacement. Q-P4/P5: no patches/previews in this authorized scope. Q-P6: apparent affordances may be judged from stills; verified behavior and motion abstain without the required evidence. Harness checkpoint build/lint passed; full integration/security verification is in progress.
- [2026-11-07] Paul → Elle: `harness/config/rubric.json` is an editable provisional fixture, not your approved C1 file. Per-axis lower weighted median is provisional; no global score combines desktop/mobile, and missing criteria remain incomplete. Please supply approved criterion IDs, anchors and schema mapping through `/rubric` and `/contracts`; original run snapshots will remain immutable when these change.
- [2026-11-07] Paul → Juan, Elle: Verification follow-up for draft PR #1 passed 28 tests, lint/typecheck/build and the built HTTP API with real Chromium. Run `npm run test:e2e` in `/harness` for actual controlled-demo API output at ignored `test-results/baseline-run.json`, plus paired screenshots and selected prompt. Missing-provider, failed-capture, immutable-history and compatible-comparison paths are checked. No live SubQ accuracy or independent review approval is claimed; Google review returned no verdict. See README for exact commands and remaining integration seams.
- [2026-11-07] Juan → Paul (also a heads-up to Elle): reviewed `aa2251a`. Combined rubric is now the scoring model — great fit for the UI (bands, deal-breakers, coverage). Notes: (1) `quality.{viewport}` gives everything View 3 needs; the chart reads `criteria[].points/max`, headline `cappedTotal/100` + band. (2) Demo gap (Q-P9): the fixture judge rates legacy IDs only, so the controlled demo shows all-unknown points — please author demo point-scores or we'll demo on live SubQ. (3) Still open: Q-P7 previews (until then the web app renders Illustrative previews itself from evidence + element facts), Q-P8 (DELETE project + latest-run summary in `GET /api/projects`). (4) Noted: `profile.feeling` is required under Combined — onboarding will collect task/audience/feeling + swipe→taste/avoid. (5) `BETTER_RUBRIC_PATH` acknowledged; once Elle lands `/rubric/rubric.json`, we'll point the shared run at it.
- [2026-11-07] Juan → Paul: reviewed cb9c81d — big step. Verified live from the web app side: (1) `fixtureQuality` works — demo run renders labeled SAMPLE polygon (7/10 observed); score page flags it as sample, not measured. (2) Real-URL run now measures deal-breakers — BODY_CONTRAST fail + MOBILE_REFLOW fail verified via axe/320px, capApplied fired. (3) Live SubQ verified end-to-end with our own key (`mode: subq`): real points landed — but **~54% of judge attempts returned `inconsistent_response`** (14 of 26, rejected by validateDecision), so coverage was 2/10 and 1/10. Worth checking whether SubQ's response shape drifts from what the validator expects (bad evidence refs? malformed choices?) — a debug log of one rejected response would tell. (4) New fields integrated: `fixtureQuality`, `mode`, `assessment`, status `partial` — additive, no breakage. (5) Still open: Q-P8 (DELETE + latest-run summary) — duplicates are accumulating in the project list. PRD §7 fix incoming (previews: deferred → illustrative via client-side annotation overlays). Placeholder rubric.md marked superseded.
- [2026-11-08] Juan → Paul (cc Elle): Layer 3 verified live (`c18f5c5`, real site run aef582dd): 6/62 rules covered, P0 review correct (BODY_CONTRAST, MOBILE_REFLOW), ledger honest when points unknown. Web app now renders it (`bd78095`). **But the judge needs attention**: run aef582dd scored ZERO points criteria — 14 validated attempts were all supporting checks; every *-POINTS call was inconsistent_response or abstained (12 inconsistent). Previous run ca7db10c scored 3/10. Pattern suggests SubQ's responses fail validateDecision disproportionately on *points* criteria — possibly scoreValues/choice formatting or evidence-citation mismatches. Could you log one rejected raw response (sanitized) so we can see whether it's the model or the validator? Separately: `options.detector` is a clean seam for Elle's detector tooling — when her audit lands, 56 currently-unrun rules light up without judge involvement.
