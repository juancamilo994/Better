# Better: context for the Lovable build

Paste this file into Lovable's project knowledge (or as the first prompt). Attach the other files in this folder as reference.
Source: github.com/juancamilo994/Better, all branches pulled 2026-11-07 (main `4d78d1a`, harness `feat/better-evaluation-loop` `d46af55`, web `juan/web-scaffold` `bd78095`).

## 1. What Better is

Better scores AI-built ("vibe-coded") web pages and tells the builder exactly how to fix them.
The user pastes a public URL. Better renders the page, scores it against a versioned design rubric, shows the score on a spider chart, proposes concrete fixes, and assembles the fixes the user picks into a Markdown prompt for their coding agent (Cursor, Claude Code, Lovable, v0, Devin). After the agent applies it, the user re-assesses and sees the score move.

User: a designer, PM, founder or developer who ships UI with AI agents and senses it is "off" without knowing why.
Job: "Tell me what's wrong with my UI, show me what better looks like on my own site, and give me the exact words to make my agent fix it."

## 2. Principles the UI must honor

1. **Evidence-bound, never guessed.** A score exists only when its evidence was captured. Unassessed criteria show as gaps ("not assessed"), never as zero.
2. **Show it on their site.** Previews on the real page are labeled **Live**; anything else is labeled **Illustrative**. Never pass a fallback off as live.
3. **Speak the agent's language.** The deliverable is a copyable, agent-agnostic Markdown prompt.
4. **Embody what we sell.** The app itself must look and feel excellent: 60fps swipe deck and chart, no jank.
5. **Honest degradation.** Clear errors for unreachable or blocked URLs, "no change" detection on reruns, a seeded demo project that always works.
6. **Never hard-code the rubric.** Axes, titles, weights, bands and deal-breakers are read from `rubric.json`.

## 3. Scope (V1)

In: the app only, five views. No marketing/landing page.
Out: auth, accounts, teams, billing; multi-page crawling (one URL per project); sites behind login or bot walls; auto-applying fixes; WCAG certification.
Desktop-first. View 4's split needs at least 1024px; smaller screens stack.

## 4. The five views

Flow: Projects → Onboarding → (evaluation runs) → Score → Recommendations → Prompt → re-assess → back to Score with progression.

**View 1, Projects (home).** List projects: name, domain, latest score, sparkline of history, last assessed. Create (name + `http(s)://` URL). Delete with confirmation (harness archives). Empty state: one-line explanation, "Create project", "Open demo project".

**View 2, Onboarding (one-time).** Project brief: task (what a visitor should accomplish), audience, feeling, plus optional taste/avoid/brand. A swipe deck of up to 5 Like/Pass design-direction cards ("Minimal & airy", "Bold & playful", "Dense & data-rich", "Editorial", "Warm & human"): physics drag with tilt, fly-out, buttons, ← / → keys, undo, progress "3/5". First impression, so animation quality is a priority. The swipe data is captured but nothing depends on it in V1. On finish: create project with profile, start first run, go to Score in its evaluating state.

**View 3, Score.**
- Evaluating state: steps (Capturing → Evaluating → Generating recommendations), skeleton chart. Runs are synchronous today, so indicative steps are fine.
- Big overall score `n /100` with band label and delta vs previous run (`68 ▲ +7`). Desktop is the headline, mobile alongside.
- Progression chart across runs.
- Interactive spider chart, one axis per rubric axis, previous run as a ghost polygon.
- Click an axis title: explainer with what it measures, this run's points, confidence, rationale, evidence.
- Limitations panel: coverage (e.g. 9 of 10 criteria assessed), not-assessed items, deal-breaker cap if applied.
- Primary CTA "See recommendations". Failed state with retry.

**View 4, Recommendations (30/70 split).**
- Left 30%: compact spider chart with axis icons; click an axis to list up to 3 ranked fix cards (title, one-line problem, priority). Persistent prompt tray "2 / 3" with CTA to View 5.
- Right 70%: the selected fix: problem, proposed change, why it matters (linked criterion), expected effect, before/after preview with **Live** or **Illustrative** badge, "Add to prompt" / "Remove".
- Soft cap 3: adding a 4th shows a non-blocking warning ("We recommend ≤3 fixes per run so you can see what moved the score").
- Note: real live previews are **not built yet**; current state is Illustrative only (annotated "before" screenshot). Design the badge for both.

**View 5, Prompt.** Monospace prompt block, Copy with confirmation, reorder/remove fixes, then "I've applied the changes → Re-assess", which starts a new run and returns to View 3. If the page is unchanged, say so instead of showing noisy deltas.

Prompt template (deterministic):

```md
# Improve the UI of {projectName} ({url})
Context: {description}

Apply ONLY the following {n} changes. Do not modify unrelated UI, content, or behavior.
Keep the existing design system (colors, fonts, components) unless a change says otherwise.

## 1. {title}  ({axis name})
{what / where / why / acceptance criteria}

## 2. ...

When done, verify each acceptance criterion above.
```

## 5. Scoring model (Elle's "Combined" rubric, `rubric.json`)

Ten weighted axes, weights total 100. Each scores anchored points (0, half, or full). Overall = sum of points, per viewport.

| Axis id | Title | Weight |
|---|---|---|
| HIER | Hierarchy | 12 |
| DENSITY | Information density | 12 |
| FLOW | Flow & effort | 10 |
| INTERACTION | Interaction & feedback | 12 |
| AUDIENCE | Audience & tone fit | 12 |
| ORIGINALITY | Originality | 10 |
| VISUAL | Visual communication | 10 |
| SYSTEM | System consistency | 8 |
| TYPOGRAPHY | Typography | 6 |
| USABILITY | Usability basics | 8 |

Bands: 90 to 100 "Distinctive and effortless. Ship it." · 75 to 89 "Strong, with fixable flaws." · 60 to 74 "Works, but generic or effortful." · 40 to 59 "Real problems users will feel." · 0 to 39 "Fails its audience. Rethink, don't polish."

Deal-breakers (9, e.g. body contrast 4.5:1, targets 24px, no horizontal scroll at 320px): a **verified** failure caps the total at **49**. Show the cap and why.

If any criterion is unassessed, `rawTotal` is `null` and the UI shows the coverage summary instead of a fake total. The rubric has no icons per axis yet (open question Q-E5), so keep a small icon map keyed by axis id.

## 6. Data shapes

Full TypeScript types: `harness-types.ts`. A realistic mock run (partial coverage, gaps, suggestions, handoff prompt): `mock-run-fixture.ts`. What the UI mostly reads:

- `Project { id, name, url, source, createdAt, profile }`
- `Run { id, projectId, parentRunId, status: complete|partial|failed|setup_needed, captures[], results[], suggestions[], quality: { desktop, mobile } }`
- `QualitySummary { criteria[{id,title,max,points|null,reason}], coverage, rawTotal|null, cappedTotal|null, capApplied, cap, band, dealBreakers[] }`
- `Suggestion { id, criterionId, viewport, label, problem, change, effect, priority }` → these are the fix cards.
- `Handoff { selectedIds, prompt }` → the saved prompt.
- `CompareResult { compatible, deltas[{criterionId, viewport, delta, label}] }` → progression and "no change".

## 7. Backend reality (important for Lovable)

The real engine is Paul's **harness**: Node + Playwright + Express + SQLite, running locally on `127.0.0.1:3000`, judged by the SubQ model (paid key, harness-only). Lovable's cloud cannot reach localhost, and the harness is not hosted. So:

1. **Build the Lovable version against mock data first.** Load `mock-run-fixture.ts` and `rubric.json` as static data behind a small `harness` client with the same method names below, so swapping to the real API later is one file.
2. Later, the harness can be exposed (tunnel or hosting, Paul's call) and the client pointed at it via an env var.
3. Optional: Supabase for projects/runs persistence is the post-MVP target in the PRD; not required for the mock build.

Harness API the client should mirror:

```
GET    /api/health
GET    /api/rubric
GET    /api/projects                     (each with latestRun.overall per viewport)
POST   /api/projects                     {name, url?, demo?, profile?}
DELETE /api/projects/:id                 (archives)
GET    /api/projects/:id                 {project, runs[]}
POST   /api/projects/:id/runs            {buildLabel?, profile?}   (synchronous, can take a minute+)
GET    /api/runs/:id                     {run, handoffs, corrections}
GET    /api/runs/:id/compare/:baseline
GET    /api/runs/:id/evidence/:evidenceId   (screenshot image)
POST   /api/runs/:id/handoffs            {selectedIds}  → prompt
```

## 8. Known state and caveats (so the UI tells the truth)

- Live scoring works on real sites (nngroup, linear, wikipedia, HN, stripe, vercel captured fine).
- **Score stability is the top open problem**: rerunning an unchanged page can move the total 6 to 11 points. Paul's fix (reuse judgments for identical screenshots, majority-of-3 sampling, "uncertain" delta labels) is in progress. Design delta display to support an "uncertain" label.
- Live before/after previews are deferred; everything is Illustrative for now.
- Weights, cap 49 and bands are Elle's proposals pending calibration.

## 9. Team

- Juan Camilo (`juancamilo994`): web app, UX/UI, prompt assembly. Existing Next.js scaffold on branch `juan/web-scaffold` (`apps/web`).
- Paul (`laulpogan`): harness.
- Elle (`elle-mcdougald`): rubric owner, final say on axes and scoring.
- Yitzy (`yitzybitzyspider`): rubric testing and motion criteria.

Visual direction is deliberately open; the product name "Better" is fixed. Do not invent testimonials, users or imagery.

## Files in this folder

- `LOVABLE-CONTEXT.md`: this brief
- `../PRD.md`, `../PRODUCT.md`: full product docs at the repo root
- `rubric.json`: current Combined rubric (source of truth for axes)
- `harness-types.ts`: all data types
- `mock-run-fixture.ts`: realistic mock run to build against
