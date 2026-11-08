# Better

**Better tells you what's wrong with your website's design, and gives you the exact prompt to make your AI coding agent fix it.**

Paste a URL. Better loads the page on a laptop and a phone, scores it against a 10-criterion design rubric, shows what's weak and why, and turns the fixes you pick into one prompt for Cursor, Claude Code, Lovable, v0 or Devin. After your agent applies it, re-check the same project and watch the score move.

**[See it live: real results from the engine](https://yitzybitzyspider.github.io/better-demo/)**

> Status: hackathon MVP. The live site shows recorded evaluations; scanning your own URL runs locally (see Quick start).

## How it works

```
 your URL ──▶ Harness (port 3000)                                  Web app (port 3001)
              1. capture   laptop 1440px + phone 390px screenshots,  ◀── calls the harness API
                           page structure, text, styles
              2. measure   contrast, tap targets, text size,          shows the score, the fixes,
                           sideways scrolling (axe-core)              and builds your prompt
              3. judge     AI judge (SubQ) scores each criterion
                           from the screenshots + your brief
              4. score     points per criterion, total out of 100,
                           per device; nothing is guessed
```

- **The rubric** (`harness/config/rubric.json`) has 10 weighted criteria totalling 100: Hierarchy 12, Information density 12, Flow & effort 10, Interaction & feedback 12, Audience & tone fit 12, Originality 10, Visual communication 10, System consistency 8, Typography 6, Usability basics 8. Accessibility deal-breakers (contrast, tap targets, focus, color-only signals, phone reflow) show as warnings.
- **Evidence-bound.** A criterion is only scored when its evidence was captured. Anything Better can't see from a still page (motion, real interaction timing) shows as "not assessed," never as a guess.
- **Your brief matters.** Before scoring you say who the site is for, how it should feel, and its one main job. The judge scores against that.

## Quick start

You need **Node 24 or newer** and macOS or Linux.

**1. Clone**

```sh
git clone https://github.com/juancamilo994/Better.git
cd Better
```

**2. Start the harness** (the engine), in one terminal:

```sh
cd harness
npm ci
npx playwright install chromium
npm run build
npm start
```

It listens on http://127.0.0.1:3000 and has its own minimal UI there.

**3. Start the web app** (the product), in a second terminal:

```sh
cd apps/web
npm install
npm run dev
```

Open **http://localhost:3001**.

**4. Try it.** Create a project, tick **Demo project**, fill in the brief, and run the first evaluation. The demo works offline with labeled sample scores, so it's the fastest way to see the whole loop.

## Scoring real websites

Real sites need the live AI judge. Without it you still get the captures and measured checks, but the 10 criteria show "setup needed."

Create `harness/.env` (it's git-ignored; never commit it):

```sh
BETTER_JUDGE=subq
SUBQ_API_KEY=your-subq-key
BETTER_ALLOW_PAID_CALLS=true
```

Restart the harness. Each evaluation makes about 26 SubQ calls. Get a key at https://console.subq.ai.

| Setting | Default | What it does |
|---|---|---|
| `PORT` | 3000 | Harness port |
| `BETTER_DATA_DIR` | `./data` | Where projects, runs and screenshots are stored. Delete it to start fresh |
| `BETTER_JUDGE` | `fixture` | `fixture` (sample scores, demo only) or `subq` (live) |
| `BETTER_ALLOW_PAID_CALLS` | `false` | Must be `true` for any paid call; a key alone never spends money |
| `SUBQ_API_KEY` | | Your SubQ key |
| `BETTER_JUDGE_CONCURRENCY` | 6 | Judge calls in flight at once, 1 to 16 (from PR #16) |
| `HARNESS_URL` (web app) | `http://127.0.0.1:3000` | Where the web app finds the harness |
| `BETTER_MOCK_MODE` (web app) | off | `1` runs the web app on fixture data with no harness |

## Using Better

1. **Create a project** with a name and a public URL. One project is one page; the URL doesn't change.
2. **Write the brief:** the one job a visitor should complete, who they are, and the feeling you want.
3. **Read the score:** total out of 100 per device, a chart of the 10 criteria, deal-breaker warnings, and what wasn't assessed.
4. **Pick fixes:** up to 3 per round is recommended, so you can see what moved the score.
5. **Copy the prompt** into your coding agent and let it make the changes.
6. **Re-evaluate** the same project. The history shows how each criterion moved.

What Better won't do: log in to sites, scan private or internal addresses, change your code itself, or certify accessibility compliance.

## Testing Better

- **Unit and integration tests:** `cd harness && npm test`, plus `npm run test:e2e` for the full API with a real browser.
- **Eval runner:** `evals/` on branch `yitzy/eval-runner`. It answers plain questions such as "does Better score a page with tiny text lower than its clean twin?" in a browser you can watch, and writes a report. Results and their pre-registered expectations are in `evals/TEST-LOG.md`.

```sh
cd evals && npm install
npm run eval -- --suite smoke                  # free
npm run eval -- --suite core --judge subq      # live judge, uses SubQ credit
```

## Repository map

| Path | What | Owner |
|---|---|---|
| `harness/` | Capture, measurements, AI judge, scoring, local API | Paul (Juan co-owns) |
| `apps/web/` | The product UI (Next.js) | Juan |
| `harness/config/rubric.json` | The rubric: criteria, weights, anchors, deal-breakers | Elle |
| `lovable/` | Context pack for building the UI in Lovable | Yitzy |
| `PRD.md` | Product requirements | Juan |
| `docs/archive/` | Superseded drafts (the original 8-axis rubric) | Elle |
| `PRODUCT.md` | Product summary for design work | Juan |
| `TEAM.md` | Roles, decisions, open questions, working agreement. **Read before contributing** | Everyone |

More detail: `harness/README.md` (API and evidence rules), `harness/docs/handoff.md` (harness state), `harness/docs/open-items.md` (open scoring questions), `apps/web/README.md`.

## Contributing

- Read `TEAM.md` first. It covers folder ownership, the decision log, and the protocol for AI agents working in this repo.
- Work on a branch named `yourname/topic` and open a pull request; don't push to `main`.
- Open work is tracked in [GitHub issues](https://github.com/juancamilo994/Better/issues). Each one links to its evidence.
- Never commit API keys. Use `.env` files, which are git-ignored.

## Team

Juan Camilo (product and UI), Paul (harness), Elle (rubric), Yitzy.
