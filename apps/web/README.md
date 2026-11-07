# Better — web app

Product UI for Better (Juan's workstream). Next.js 16 (App Router) + TypeScript + Tailwind + Framer Motion. Talks to the local harness (`/harness`, Paul) over its `/api`.

## Run

```sh
npm install
cp .env.example .env.local   # optional; defaults point at the local harness
npm run dev                  # http://localhost:3001
```

Start the harness first (see `/harness/README.md`: `npm ci && npx playwright install chromium && npm run build && npm start`) for live data on `127.0.0.1:3000`.

**UI dev without the harness:** set `BETTER_MOCK_MODE=1` in `.env.local` — `src/lib/harness/fixtures.ts` serves a realistic Combined-rubric run (partial coverage, gaps, suggestions, handoff prompt).

## Shape

- `src/lib/harness/types.ts` — mirrors `harness/src/domain.ts` (replace with `/contracts` types once approved)
- `src/lib/harness/client.ts` — typed `/api` client; `index.ts` swaps real/mock on `BETTER_MOCK_MODE`
- `src/lib/actions.ts` — server actions: create project, start run, handoff, re-assess
- Routes: `/` projects · `/projects/[id]` score (View 3) · `/onboarding` (View 2) · `/recommendations` (View 4) · `/prompt` (View 5)
- `src/components/` — client pieces (copy button, suggestion picker with the ≤3 soft-cap warning)

Pages are thin data shells — **visual design lands from Paper mockups** (`/design`), per TEAM.md. Pending harness items: `DELETE /api/projects`, latest-run summary in `GET /api/projects`, live previews (Q-P7/Q-P8).
