# Better — Product Requirements Document (V1 / Hackathon Demo)

> Status: **Draft v0.1. Open for review by Paul (harness) and Elle (rubric).**
> Owner: Juan Camilo. Last updated: 2026-11-07.
> Companion doc: [`TEAM.md`](./TEAM.md) covers roles, interface contracts, the working agreement and the agent protocol.

---

## 1. Summary

**Better** is a web service that evaluates, scores, teaches and generates prompts for improving AI-assisted ("vibe-coded") designs. The goal is interfaces that are better, easier and more pleasant for humans to use.

The user gives Better the URL of their site. Better renders it, scores it against a design rubric, and shows the score on a spider chart. It then proposes concrete fixes, previews each fix **live on the user's own site**, and turns the fixes the user picks into a prompt for their coding agent (Cursor, Claude Code, Devin, Lovable, v0, …). After the agent applies the prompt, the user re-runs the assessment and sees how the score moved. That loop repeats in search of a "Better" design.

### 1.1 Goals for V1

1. Demo the full loop end-to-end on a real public URL: **create project → onboard → score → explore recommendations with live before/after → build prompt → re-assess → see progression.**
2. Make the scoring credible and explainable. Every score links back to rubric criteria and visible evidence.
3. Make the experience itself an example of great UI, since we are a product about great UI.

### 1.2 Non-goals for V1

- Authentication, user accounts, multiple profiles, teams, billing.
- Multi-page crawling. V1 evaluates **one URL** (a single page) per project.
- Sites behind login, paywalls or bot protection.
- Automatically applying fixes to the user's codebase. We generate the prompt and the user's agent applies it.
- Real personalization from onboarding. The swipe step is FPO in V1: we capture the data but nothing depends on it yet.
- Certifying accessibility compliance (WCAG). We flag concerns; we don't certify.

### 1.3 Constraints

- **Timeline:** hackathon, measured in days. We cut aggressively and protect the happy path.
- **Demo reliability beats breadth.** A seeded demo project with a known-good evaluation must always work, even if a live run fails (see §9).

---

## 2. Users & core use case

**Primary user:** a builder (designer, PM, founder, developer) who ships UI with AI coding agents and senses the result is "off" without knowing exactly why or how to ask the agent to fix it.

**Job to be done:** *"Tell me what's wrong with my UI, show me what better looks like on my own site, and give me the exact words to make my agent fix it."*

---

## 3. Core concepts

| Concept | Definition |
|---|---|
| **Project** | A unique, persistent container (UUID) that tracks one design's journey toward "Better". It holds the URL, description, onboarding result, every evaluation and every generated prompt. |
| **Project URL** | The page being assessed. It is set at creation and treated as **immutable**. Changing it is allowed only after a warning that scores may no longer be comparable. A URL change starts a new baseline in the history. |
| **Onboarding** | A one-time step: a free-text project description plus up to 5 Like/Pass swipe decisions on design-direction cards. FPO in V1. |
| **Rubric** | Elle's versioned definition of the scoring axes, criteria, scale and anchors. It is the single source of truth for what gets scored and how. |
| **Axis (category)** | One dimension of the spider chart (e.g. Hierarchy & Wayfinding). Each axis contains criteria. |
| **Evaluation (run)** | One assessment of the project URL at a point in time. It produces axis scores, an overall score, evidence and ranked recommendations. |
| **Overall score** | A single number built from the axis scores: their sum (or weighted sum) over the total maximum of all axes, normalized for display. The exact formula is owned by Elle (see §6). |
| **Recommendation (fix)** | A concrete, ranked improvement tied to an axis and its criteria. It carries a machine-applicable **patch** (for the live preview) and an agent-ready **prompt snippet**. |
| **Preview** | The before/after rendering of a single recommendation applied to the user's actual page. |
| **Prompt** | The final instruction set assembled from the selected recommendations, ready to paste into a coding agent. |

---

## 4. User flow

```
[1 Projects] ──create──▶ [2 Onboarding] ──▶ (evaluation runs) ──▶ [3 Score]
     ▲                                                              │
     │                                                   "See recommendations"
     │                                                              ▼
     │                                                  [4 Recommendations 30/70]
     │                                                              │ add ≤3 fixes
     │                                                              ▼
     └──────── (agent applies prompt, user re-assesses) ◀── [5 Prompt]
```

Re-assessment returns the user to **[3 Score]**, which now shows the progression across runs.

---

## 5. Views & functional requirements

Visual design for every view will be produced in **Paper** (via the Paper MCP) during implementation. Coding agents implement from those designs. The requirements below are functional; layout and visual details live in Paper.

### View 1 — Projects (home)

Purpose: create, select or delete a project. There is no auth; every project is visible to everyone using the deployment.

- **FR-1.1** List existing projects with name, URL (domain), latest overall score, a sparkline of score history and last-assessed time.
- **FR-1.2** Create a project with **name** and **URL** (required, validated as `http(s)://`, publicly reachable). On create, go to Onboarding.
- **FR-1.3** Select a project to open its latest Score view. If onboarding is incomplete, resume onboarding instead.
- **FR-1.4** Delete a project with a confirmation step. Deletion cascades to its evaluations, previews, prompts and stored screenshots.
- **FR-1.5** Empty state: explain Better in one line and offer "Create project" plus "Open demo project".

### View 2 — Onboarding (one-time)

Purpose: capture the project's intent and design taste.

- **FR-2.1** A **project description** textarea: what the site is, who it's for, and the main task a visitor should complete.
- **FR-2.2** A **swipe deck** of design-direction cards, with **up to 5 decisions** of Like or Pass. Cards show an image/mood plus a short label (e.g. "Minimal & airy", "Bold & playful", "Dense & data-rich", "Editorial", "Warm & human").
- **FR-2.3** Interaction: drag or swipe with physics (the card tilts and follows the pointer, then snaps back or flies out), button alternatives (Pass / Like), keyboard alternatives (← / →) and an undo for the last decision. **The animation quality is a priority**: it is our first impression.
- **FR-2.4** A progress indicator (e.g. 3/5). The user can finish early after at least one decision or the description.
- **FR-2.5** On finish, save `{ description, decisions[] }` to the project, start the first evaluation and move to the Score view in its "evaluating" state.
- **FR-2.6** **FPO:** the card set is static and the result is stored and passed to the harness as context. Nothing else depends on it in V1. (The rubric's "taste channel" may consume it later; see open questions in TEAM.md.)

### View 3 — Score

Purpose: show how good the design is today, how it has progressed, and what each axis means.

- **FR-3.1** An **evaluating state**: progress steps streamed from the harness (Capturing → Evaluating → Generating recommendations → Rendering previews), a skeleton chart and a screenshot of the page as soon as it's captured. *MVP: calls are synchronous, so a spinner or indicative (non-streamed) steps are acceptable.*
- **FR-3.2** An **overall score**, large and prominent, with the delta against the previous run (e.g. `68 ▲ +7`).
- **FR-3.3** **Progression**: a compact history chart of the overall score across runs. URL-change baselines are marked.
- **FR-3.4** An **interactive spider chart**, one axis per rubric axis, plotted on the rubric scale. The previous run shows as a ghost polygon for comparison.
- **FR-3.5** Clicking an **axis title** opens an explainer (popover or side sheet) with the axis summary, "what matters" bullets, this run's score and confidence, a short rationale and the evidence. All content comes from the rubric plus the evaluation result.
- **FR-3.6** **Limitations**: when the harness reports low confidence or missing evidence (e.g. "motion not assessed: no recording"), show it plainly.
- **FR-3.7** A primary CTA, **"See recommendations"**, which opens View 4.
- **FR-3.8** A failed state that shows a clear error (unreachable URL, blocked, timeout) with a retry option.

### View 4 — Recommendations (30/70 split)

Purpose: explore fixes per axis, preview them live and add them to the prompt.

**Left panel (30%)**
- **FR-4.1** Top half: the same spider chart, compact. **Axis titles are replaced by icons** (from the rubric). The selected axis is highlighted.
- **FR-4.2** Clicking an axis icon loads that axis's **top recommendations (up to 3; fewer is fine)** in the bottom half, as ranked cards showing title, a one-line problem statement, expected impact and effort. Fix text may be generic (pre-written per rubric finding); a fix only appears if the issue was detected.
- **FR-4.3** A persistent **prompt tray** showing selected fixes (`2 / 3`) and a CTA to View 5.

**Right panel (70%)**
- **FR-4.4** Clicking a recommendation shows its **before/after preview** on the user's actual page. It offers a slider or toggle comparison, defaults to a crop focused on the affected region, and lets the user expand to the full page.
- **FR-4.5** A preview **badge**: **Live** (rendered on their site) or **Illustrative** (fallback; see §7).
- **FR-4.6** Details: the problem, the proposal, why it matters (linked rubric criteria) and the expected score impact.
- **FR-4.7** **"Add to prompt"** / **"Remove from prompt"**.
- **FR-4.8** **Soft cap of 3 fixes per run.** Adding a 4th shows a non-blocking warning ("We recommend ≤3 fixes per run so you can see what moved the score"). The user may proceed.
- **FR-4.9** Preview loading state: a skeleton plus the "before" image while the "after" renders.

### View 5 — Prompt

Purpose: hand the user an actionable prompt and close the loop.

- **FR-5.1** Show the **assembled prompt** in a readable, monospaced block. Its structure: project context, then one section per fix (what / where / why / acceptance criteria), then global constraints (e.g. "don't change unrelated elements").
- **FR-5.2** A **Copy** button with confirmation. We record that the prompt was copied.
- **FR-5.3** The user can reorder or remove fixes here. Light inline editing is a stretch goal.
- **FR-5.4** **"I've applied the changes → Re-assess"** starts a new evaluation on the same URL and returns to View 3 in its evaluating state.
- **FR-5.5** After re-assessment, the Score view highlights axes whose score changed and, where possible, which applied fixes are now detected as resolved (stretch).

### Cross-cutting

- **FR-X.1 URL change.** Project settings allow changing the URL **only after a warning modal**: "Changing the URL may make new scores incomparable with previous ones." Confirming starts a new baseline.
- **FR-X.2 No-change detection.** If a re-assessment detects that the page hasn't changed (same page fingerprint), tell the user before or instead of showing noisy score differences.
- **FR-X.3 Demo project.** A seeded project with a precomputed evaluation and previews that always works (see §9).
- **FR-X.4 Responsive.** The web app is desktop-first for V1. View 4's split view requires a width of at least 1024px; smaller screens get a stacked fallback.

---

## 6. Scoring model

The **rubric is owned by Elle** and lives in `/rubric`. **Current model (adopted 2026-11-07, transcribed by Paul from Elle's source doc): the "Combined" rubric** — 10 weighted criteria whose weights total 100, scored with anchored point choices; plus supporting checks that never deduct. The earlier [`Placeholder rubric.md`](./Placeholder%20rubric.md) (8 axes, 1–4) remains as background; its boundaries carry over (single penalty home per issue, evidence-bound, taste ≠ quality, screenshots flag but don't certify):

| Code | Axis | Scope (abridged) |
|---|---|---|
| HIER | Hierarchy & wayfinding | Focal point, primary vs. secondary actions, grouping, reading order, location cues |
| LAY | Layout & spatial rhythm | Grid, alignment, spacing, density, whitespace, clipping/overlap |
| TYPE | Typography & content clarity | Type scale, legibility, line length; plain, specific copy (scored separately) |
| ACC | Color & accessibility | Measured contrast, non-color cues, focus, labels, target sizes (flags, not certification) |
| CRAFT | Visual craft & consistency | Coherent components, palette, radii, elevation, icons, imagery, finish |
| INT | Interaction & feedback | Affordances, states, loading/validation/recovery; motion only with temporal evidence |
| ADAPT | Adaptation & cross-device | Reflow and reprioritization across matched viewport captures |
| FIT | Purpose, brand & trust | Task/audience fit, brand coherence, clarity of claims and pricing, credibility cues |

**Proposed anchors (criterion level):** 1 = material obstacle to the stated task · 2 = usable with significant defects · 3 = solid with minor defects · 4 = strong and intentional. The scale is ordinal; no decimals at the criterion level.

**Principles the product must respect:**
- **Single home per criterion.** No double-counting across axes.
- **Evidence-bound.** A score can only be given if its required evidence was captured. Otherwise it is reported as *not assessed* or *low confidence*, never guessed.
- **Taste vs. quality.** Style preference is not quality. Onboarding taste data must not silently penalize quality axes.

**Overall score (decided 2026-11-07):** `overall = Σ criterion points`, computed deterministically per viewport as `run.quality.{viewport}` — `rawTotal` when all points are assessed, else `null` with a coverage summary; `cappedTotal` applies the deal-breaker cap (verified failure → cap 49). Displayed as `n /100` plus the band label (90–100 "Distinctive and effortless", 75–89 "Strong, with fixable flaws", 60–74 "Works but generic or effortful", 40–59 "Real problems", 0–39 "Fails its audience"). Desktop is the headline, mobile alongside. Unassessed criteria are gaps, never zeros. The UI reads axes, weights, bands and deal-breakers from the rubric file and never hard-codes them.

**Score stability:** re-running an unchanged page should produce the same score. The harness should minimize LLM variance (low temperature, structured output, pinned model and rubric version, optionally multiple samples) and report a page fingerprint so the UI can flag "no change".

---

## 7. Live before/after previews (the key technical challenge)

**Decision: hybrid approach.** Real patches are rendered on the user's page in a headless browser. If a patch can't be applied cleanly, an annotated illustrative fallback is shown instead.

### 7.1 How "Live" previews work

1. The harness loads the URL in a headless browser (e.g. Playwright/Chromium) at fixed viewports (desktop 1440×900; mobile 390×844 for ADAPT).
2. It captures evidence: full-page and viewport screenshots, the DOM snapshot, the accessibility tree, computed styles of key elements and measured contrast.
3. The LLM produces each recommendation with a **declarative patch**: scoped CSS plus a small set of allowed DOM operations (`setText`, `hide`/`remove`, `setStyle`, `setAttr`, `addClass`, `move`). **No arbitrary JS.** Declarative patches are safer, deterministic and easy to validate.
4. The harness re-opens the page, applies the patch, **verifies** that the selectors matched and the pixels actually changed, then captures an "after" screenshot. It returns both full-page images and a crop focused on the affected region (the bounding box of the touched elements plus padding).
5. The web app displays images only. The user's site is **never** executed inside Better's origin, so there are no iframe, CSP or XSS issues.

This covers the vision's examples: button placement and color (`setStyle` / CSS / `move`), removing text (`hide` / `setText`), spacing, hierarchy, contrast, type scale, and so on.

### 7.2 "Illustrative" fallback

A preview falls back when the selector doesn't match, the visual diff is negligible, the page is too dynamic, or the fix is structural (e.g. "add a loading state", "rework navigation for mobile"). The fallback is the "before" screenshot with annotation boxes and labels marking what would change, plus the textual proposal. The UI labels it **Illustrative**. Pre-designed, tutorial-style example images per fix pattern (from the rubric's fix patterns) are a stretch addition.

### 7.3 Stretch: interactive live preview

Serve a sanitized snapshot of the page (static HTML/CSS, scripts stripped) in a sandboxed iframe on a separate origin, and toggle patches live. This is out of scope unless the hybrid approach is done early.

### 7.4 Known limitations

- Sites with heavy client-side rendering, cookie walls or bot protection may fail. We surface clear errors and rely on the demo project.
- Fixes that need interaction (hover, validation, loading) can only be previewed if the harness simulates the state. Otherwise they are Illustrative.

---

## 8. Prompt generation

- Each recommendation carries an agent-ready **`promptSnippet`**, written by the harness, with:
  - **What:** the change, in plain language.
  - **Where:** a human description plus a CSS selector hint.
  - **Why:** the linked rubric criteria.
  - **Acceptance criteria:** observable checks.
- The **web app assembles the final prompt** deterministically from a template: project context (name, URL, description), the selected snippets in order, and global guardrails (scope the change, don't alter unrelated UI, keep existing functionality, respect the existing design system).
- The output format is plain Markdown, agent-agnostic (it works in Cursor, Claude Code, Devin, Lovable, v0).

---

## 9. System architecture (V1)

> **MVP (decided 2026-11-07): runs locally on one machine.** Paul's harness (`/harness`, Node + Playwright + Express, loopback `127.0.0.1:3000`) is the source of truth for projects, runs, comparisons and handoffs (SQLite + disk). The web app (Next.js, port 3001) calls the harness's local `/api` from its server routes. Calls are synchronous, one capture at a time. **Supabase, Vercel hosting and Realtime progress are deferred to post-MVP.** The diagram below is the post-MVP target. Live-preview approach: owned by Paul (see TEAM.md §4, Q-P7).

```
┌───────────────────────────┐        HTTPS (bearer secret)       ┌─────────────────────────────┐
│  Web app  (Juan)          │ ─── POST /v1/evaluations ────────▶ │  Harness  (Paul)            │
│  Next.js + TS, Vercel     │ ─── POST /v1/previews ───────────▶ │  Headless browser + LLMs    │
│  Views 1–5, prompt build  │                                    │  Stack/LLM: Paul's call     │
└────────────┬──────────────┘                                    └──────────────┬──────────────┘
             │ read/write (projects, prompts)                                   │ write status/results,
             │ read + realtime (evaluations, previews)                          │ upload screenshots
             ▼                                                                  ▼
       ┌──────────────────────────── Supabase (Postgres + Storage + Realtime) ────────────────┐
       │  projects · evaluations · previews · prompts      bucket: captures/                  │
       └───────────────────────────────────────────────────────────────────────────────────────┘
                                         ▲
                                         │ reads rubric.json (versioned)
                                  /rubric (Elle)  ← both the web app and the harness consume it
```

- **Web app** (Juan): Next.js (App Router) + TypeScript, Tailwind, Framer Motion (swipe and transitions) and a custom SVG spider chart (needed for clickable axis titles and icons and for animated transitions). Hosted on Vercel.
- **Harness** (Paul): language, runtime, LLM provider(s) and hosting are **Paul's decision**. It is a long-running service, separate from Vercel, because headless browsers and multi-minute jobs don't fit serverless limits. It must satisfy the contract in TEAM.md §5.
- **Data** (Supabase): Postgres for data, Storage for screenshots, Realtime for streaming evaluation status to the UI. The web app owns the schema and migrations. The harness writes only to its designated tables and columns.
- **Async jobs:** the web app creates the `evaluations` row (`queued`) and calls the harness. The harness updates status and results in Supabase as it progresses. The UI subscribes via Realtime, with polling as a fallback. This avoids request timeouts and keeps the two services loosely coupled.
- **Mock mode:** the web app runs against **fixture JSON** in `/contracts/fixtures` until the harness is ready. The harness can be developed against the rubric and contract independently.
- **Demo safety:** the seeded demo project ships with a precomputed evaluation and previews (fixtures plus stored images), so the demo never depends on a live run.

### Security basics
- Secrets live in environment variables only (never committed). LLM keys exist **only** in the harness. The Supabase service-role key exists only server-side.
- The harness must block SSRF: only `http(s)`, no private, loopback or link-local IPs, plus timeouts and page-size limits.
- Patches are declarative and applied only inside the harness's headless browser.

---

## 10. Data model (draft — Juan owns, Paul reviews)

| Table | Key fields |
|---|---|
| `projects` | `id` uuid, `name`, `url`, `description`, `onboarding` jsonb, `baseline` int (increments on URL change), `created_at`, `updated_at` |
| `evaluations` | `id` uuid, `project_id`, `url`, `baseline`, `rubric_version`, `status` (`queued`/`capturing`/`evaluating`/`recommending`/`rendering_previews`/`succeeded`/`failed`), `progress` jsonb, `overall_score`, `result` jsonb (see contract), `page_fingerprint`, `error`, `created_at`, `completed_at` |
| `previews` | `id` uuid, `evaluation_id`, `recommendation_id`, `status`, `mode` (`live`/`illustrative`), `before` jsonb, `after` jsonb, `annotations` jsonb, `diff_ratio`, `failure_reason` |
| `prompts` | `id` uuid, `project_id`, `evaluation_id`, `recommendation_ids` text[], `prompt_text`, `copied_at`, `created_at` |
| Storage `captures/` | `{project_id}/{evaluation_id}/{viewport}-{full|viewport}.png`, `…/previews/{recommendation_id}-{before|after}[-crop].png` |

Deleting a project cascades to everything under it.

---

## 11. Success criteria for the demo

1. A new project on a real public URL produces an evaluation with all axes scored (or explicitly *not assessed*) and at least 3 recommendations on most axes.
2. At least **70% of the top recommendations** render as **Live** previews on typical marketing or landing pages.
3. Copy prompt → apply in a coding agent → re-assess shows a visible score change on the targeted axes.
4. Re-running an **unchanged** page gives the same overall score (±2), or the UI flags "no change".
5. The seeded demo project works offline from the harness.
6. The swipe onboarding and chart interactions feel polished: smooth at 60fps, no layout jank.

---

## 12. Milestones (hackathon)

| # | Milestone | Juan (web) | Paul (harness) | Elle (rubric) |
|---|---|---|---|---|
| M0 | **Alignment** | PRD, TEAM, repo skeleton | Review contracts; pick stack and LLM | Review contracts; rubric v0.1 |
| M1 | **Contracts frozen v1** | Fixtures + JSON Schemas in `/contracts` | Ack contract; stub `/v1/evaluations` that writes fixture results | `rubric/rubric.json` v0.1 validates against the schema |
| M2 | **Walking skeleton** | Views 1–5 on fixtures; Supabase wired | Real capture + scoring on 1 URL | Anchors and evidence requirements per criterion |
| M3 | **Real loop** | Realtime status, prompt assembly, re-assess | Recommendations + Live previews + fallback | Fix patterns per axis; calibration on sample sites |
| M4 | **Polish & demo** | Paper-quality UI, animations, demo project | Stability, variance, error handling | Calibrate scores on the demo site |

Demo date: **TBD**.

---

## 13. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM score variance makes "did my fix help?" unreliable | Pinned model and rubric version, low temperature, structured output, optional multi-sample, page fingerprint for no-change detection |
| Target sites block headless browsers | Realistic UA and viewport, clear error states, demo project as a safety net |
| Patches fail on dynamic or SPA pages | Selector verification plus pixel-diff check, Illustrative fallback |
| Long evaluation times hurt the demo | Stream progress via Realtime, show the screenshot early, render previews after scores are shown |
| Contract drift between the three workstreams | Versioned contracts, fixtures and JSON Schema in `/contracts`, change process in TEAM.md |
| 8 axes make the chart dense at 30% width | Icons on the compact chart, tooltips, Paper design pass on legibility |

---

## 14. Open questions

Tracked with owners in [`TEAM.md` §10](./TEAM.md#10-open-questions).
