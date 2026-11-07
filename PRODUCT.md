# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Locked by team decision (TEAM.md §4, decision log 2026-11-07): web app is Next.js (App Router) + TypeScript + Tailwind + Framer Motion, with a custom SVG spider chart; runs locally on port 3001 for MVP and calls the local harness API (Node 24 + TS + Playwright + Express, `127.0.0.1:3000`, SQLite). Supabase, Vercel hosting and Realtime are deferred to post-MVP.

## Users

Primary user only (confirmed): a builder — designer, PM, founder or developer — who ships UI with AI coding agents (Cursor, Claude Code, Devin, Lovable, v0) and senses the result is "off" without knowing exactly why or how to ask the agent to fix it. Job: *"Tell me what's wrong with my UI, show me what better looks like on my own site, and give me the exact words to make my agent fix it."*

## Product Purpose

Better evaluates, scores, teaches and generates prompts for improving AI-assisted ("vibe-coded") designs. The user gives it a URL; Better renders the page, scores it against a versioned design rubric, shows the score on a spider chart, proposes concrete fixes previewed live on the user's own site, and assembles the selected fixes into an agent-ready prompt. Re-assessment after the agent applies the prompt closes the loop and shows progression. V1 success: the full loop demos end-to-end on a real public URL, scoring is credible and explainable, and the experience itself exemplifies great UI.

## Positioning

The mechanism a neighboring product can't truthfully copy: evidence-bound scoring against a versioned rubric (every score links to criteria and captured evidence, and unassessed axes are reported rather than guessed) combined with before/after previews rendered on the user's actual page — not a generic mockup — and an output that is the exact prompt for the user's coding agent, closing a measurable improvement loop.

## Operating Context

Hackathon build, timeline in days; demo reliability beats breadth and a seeded demo project must always work. Local MVP: everything runs on one machine (web :3001 → harness :3000). Three workstreams — Juan (web/UX/UI, owns `/apps/web`, `/design`, root docs), Paul (harness, `/harness`), Elle (rubric, `/rubric`) — coordinated through contracts in `/contracts`; folder ownership is enforced by CODEOWNERS, shared contracts need all affected owners. The generated prompt's consumer is an external coding agent, so it must be agent-agnostic Markdown. Usage scene is desktop-first; View 4's split view needs ≥1024px.

## Capabilities and Constraints

Confirmed constraints: no auth/accounts/teams in V1; one project = one immutable URL (single page, no crawling); no sites behind login, paywalls or bot protection; Better never executes or modifies the user's site — patches are declarative (scoped CSS + whitelisted DOM ops) applied only inside the harness's headless browser; the agent applies the prompt, not Better. Soft cap of 3 fixes per run (non-blocking warning). Overall score = sum of weighted criterion points per viewport, deterministic (`run.quality.{viewport}`), displayed `score /100` with a band label and a deal-breaker cap (49); unassessed criteria shown as gaps, never guessed. The UI reads axes, scale, names and icons from `rubric.json` and must never hard-code rubric content. Onboarding (description + ≤5 swipe decisions) is FPO — captured but nothing depends on it. Better flags accessibility concerns but does not certify WCAG. Product scope confirmed: the app (5 views) only — no marketing/landing surface; hackathon judges get no special design treatment.

## Brand Commitments

Product name "Better" is fixed. Voice, identity and visual direction are deliberately open — visual design is produced in Paper during implementation; nothing else is binding.

## Evidence on Hand

Authoritative docs: `PRD.md` (product requirements, flows, architecture, data model, milestones), `TEAM.md` (roles, contracts C1–C6, decision log, open questions, status board), Elle's **Combined rubric** (10 weighted criteria → /100, bands, deal-breaker cap) is transcribed at `harness/config/rubric.json` on Paul's branch; `Placeholder rubric.md` is the earlier 8-axis draft. Paul's harness checkpoint exists on branch `feat/better-evaluation-loop` (draft PR #1) with a documented local API and a native mini-UI. `/contracts` schemas and fixtures are planned but not yet written. No real user content, testimonials, or imagery exists — future work must not fabricate them.

## Product Principles

1. **Evidence-bound, never guessed.** A score only exists when its required evidence was captured; low confidence and gaps are shown plainly.
2. **Show it on their site.** The before/after on the user's real page is the persuasive core — fallbacks are labeled "Illustrative", never passed off as live.
3. **Speak the agent's language.** The deliverable is the exact prompt that makes the user's agent fix it; the loop closes with a measurable score change.
4. **Embody what we sell.** A product about great UI must itself be a credible example — interactions (swipe deck, chart) at 60fps, finish level high enough to survive a room of skeptics.
5. **Honest degradation.** Clear errors on unreachable/blocked URLs, "no change" detection on re-runs, and a seeded demo path that always works.
