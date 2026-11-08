# DESIGN — Better

Visual direction + handoff for `apps/web`. Reference of record: **Elle's
"UI base" build** (`UI base/`, Lovable/TanStack Start prototype), ported onto
the Next.js app on branch `juan/elle-ui-port`. Tokens live in
`apps/web/src/app/globals.css`.

## Direction — light atelier

Porcelain ground, porcelain panels: the product is a quiet studio table and
the user's site is the print laid on it. One deep-green primary, one
periwinkle score action, oversized radii, one Instrument Sans voice. The
score is a deformable **score globe** — weaknesses read as surface dents,
not dashboard charts — and fixes arrive as large option cards you tap to
compose a prompt.

- **Mood**: bright studio — warm off-white ground, ink type, white panels
  with soft deep shadows; captures carry the contrast.
- **Signature move**: tap a suggestion card → ring + "In prompt" + the card
  expands into change / expected effect / Illustrative preview; the sticky
  tray counts the prompt.
- **Tone**: encouraging teacher — scores frame what to strengthen, never a
  verdict.
- **Accent discipline**: `--score-action` (periwinkle) is the CTA surface;
  `--primary` (deep green) marks selected states, deltas and links;
  `--accent` (orange) flags measured annotations only; `--destructive`
  reserved for errors/deal-breakers.

## Tokens

Defined as oklch values in `:root`, mapped in `@theme inline` (Tailwind v4).

| Token | Value | Use |
|---|---|---|
| `background` | `oklch(0.96 0.003 140)` | page ground |
| `foreground` | `oklch(0.16 0.01 140)` | primary text |
| `score-panel` | `oklch(1 0 0)` | cards, panels, prompt doc |
| `url-entry` / `url-entry-border` | `oklch(0.94/0.82)` | inputs, pill bar |
| `primary` | `oklch(0.32 0.04 155)` | selected, deltas, primary ink |
| `secondary` | `oklch(0.72 0.07 160)` | mobile radar series, tinted notes |
| `score-action` | `oklch(0.9 0.045 235)` | primary CTA fill |
| `accent` | `oklch(0.66 0.18 45)` | measured annotation boxes |
| `muted` / `muted-foreground` | `oklch(0.54/0.36)` | captions, unassessed |
| `border` / `input` / `ring` | ink alpha | hairlines, focus |
| `destructive` | `oklch(0.6 0.2 27)` | errors, deal-breaker verdicts |
| `globe-surface` / `globe-light` | blue-grey | score-globe material |

`--radius: 1.75rem` — panels use `rounded-[var(--radius)]`, inputs and CTAs
`rounded-full`, card interiors `rounded-[calc(var(--radius)-0.5rem)]`.
`--shadow-device: 0 40px 80px -30px oklch(0.2 0.02 140 / 45%)` on every panel.

## Type

- **Instrument Sans** (`font-sans`) — everything; `tracking-display`
  (−0.045em, 0.92 lh) for score numerals and hero/display lines. Loaded via
  `next/font` as `--font-instrument`.
- **Geist Mono** (`font-mono`) — the prompt document only.

Scale: hero 6xl–8xl semibold 1.12 lh, view titles 4xl–5xl, body sm–base,
captions xs.

## The five views (as built)

1. **Projects** — Elle's landing split: "Make what you built better." +
   name/URL pill ("Score it") + seeded-demo note; right column = project
   rows (score, band, archive), `divide-y` hairlines.
2. **Onboarding** — centered white panel "Set the brief." with pill fields.
3. **Score** — panel: "Score for {url}" + big `n/100` + band + delta;
   score globe (toggles to previous run); 10 criterion tiles (points/max +
   delta, unassessed as `—`); below, "By criterion" glossary from real
   `reason` strings. Right rail: radar (ghost = previous comparable run),
   capture, deal-breakers, detector review, run history.
4. **Recommendations** — 30/70: left rail = compact radar + axis anchors;
   right = axis-grouped suggestion cards (label / problem, tap → Add) with
   sticky "n selected · Build the prompt" tray.
5. **Prompt** — left rail = "In this prompt" + "Not in this prompt" honesty
   cards + re-assess CTA; right = mono Markdown doc on white panel +
   Copy.

## Score globe

`ScoreGlobe` → `ScoreGlobeScene` (three.js, `next/dynamic` ssr:false).
`lib/globe-shape.ts`: criterion points → 0–100 fractions over a Fibonacci
sphere; **unassessed criteria are passed as 100** — they contribute no
deformation, so the globe never fabricates a measured weakness. Deformation
is a texture, not a readout: honest numbers live in the criterion grid and
radar.

## Honesty rules (non-negotiable)

- `Illustrative` = annotated capture of the real page (measured boxes solid
  `--accent`, inferred dashed muted). Live patch previews don't exist yet —
  nothing may pretend otherwise.
- Unassessed criteria shown as gaps (`—`, "not assessed"), never zeroed.
- Deltas only between version-comparable runs; "not comparable" labeled.
- Sample/fixture data always labeled SAMPLE / "not measured".
- Rubric axes, titles, weights come from `rubric.json` — never hard-coded.

## Building

- Desktop-first; V4's 30/70 split and V5 rail need ≥1024px, stack below.
- shadcn primitives vendored in `src/components/ui/` (button, dialog);
  `cn()` in `src/lib/utils.ts`; icons via `lucide-react`; `tw-animate-css`
  for dialog motion.
- `animate-rise` (0.6s ease-out translate) on view entry; respect
  `prefers-reduced-motion` (globe rotation already does).

## Not designed yet

- The View-2 swipe deck (taste cards) — forms carry the brief for now.
- Live before/after patch previews (pending TEAM Q-P7).
- Axis icons per rubric axis (Q-E5) — radar/axis lists show titles only.
- Motion spec beyond `animate-rise` and dialog transitions.
- Empty/error states beyond the inline alerts shipped in V1–V3.

## Superseded

The earlier "Wall" (nocturnal cinema: dark `#0B0E13`, amber `#FFC857`,
Bebas Neue, Paper file `01M6VZ7HDP3HED3KW0ED3E1HPT`) was replaced by
Elle's UI base before any styled implementation landed — the Paper file
remains as history, not as guidance.
