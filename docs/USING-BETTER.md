# Using Better

Better looks at one page of your website the way a design reviewer would, scores it, and writes the prompt that gets your AI coding agent to fix what's weak. This guide is for people using Better, not building it. To install and run it, see the [README](../README.md). To see real results without installing anything, open the [live demo](https://juancamilo994.github.io/Better/).

## The loop in five steps

1. **Paste your URL.** One project is one page (your home page, a landing page, a pricing page). The page must be public: Better won't log in and won't scan private or internal addresses.
2. **Check the brief.** Better reads your site and fills in three things: the one job a visitor should complete, who the site is for, and how it should feel. Fix anything that's off, then click **Looks right: run the evaluation**. Everything is judged against this brief, so it matters.
3. **Read your score.** Better loads the page on a laptop (1440px) and a phone (390px) and scores each separately, out of 100.
4. **Pick fixes.** Choose the ones you agree with. Up to 3 per round is recommended, so you can tell which change moved the score.
5. **Copy the prompt** into Cursor, Claude Code, Lovable, v0 or Devin. When your agent is done and the site is updated, open the same project and click **Re-evaluate**. The history shows what moved.

## Reading the score

| Criterion | Points | What it asks |
|---|---|---|
| Hierarchy | 12 | Do you know where to look within seconds? |
| Information density | 12 | Does each section say one thing? |
| Flow & effort | 10 | Is the next step obvious, and is the effort right for the task? |
| Interaction & feedback | 12 | Does the visitor feel they can do something, not just read? |
| Audience & tone fit | 12 | Could you guess the audience with the logo covered? |
| Originality | 10 | Is it memorable, or could it be any template? |
| Visual communication | 10 | Do visuals carry the meaning, with text supporting them? |
| System consistency | 8 | Do buttons, corners, spacing and colors follow one system? |
| Typography | 6 | A few confident text sizes, readable body text? |
| Usability basics | 8 | Familiar behavior, easy tap targets, visible status? |

- **Not assessed is not zero.** Some things can't be judged from a still page (animation, how fast a button responds). Better shows those as "not assessed" instead of guessing.
- **Deal-breakers** are accessibility minimums: text contrast, tap target size, visible keyboard focus, meaning shown by color alone, and sideways scrolling on a 320px phone. A failure shows as a warning with the elements that failed.
- **Laptop and phone are separate.** A page can be fine on a laptop and broken on a phone; Better never averages them together.

## Getting good results

- **Use a page with one clear job.** A focused landing page scores more usefully than a sprawling hub.
- **Keep the brief the same between rounds.** Changing it changes what "good" means, so scores before and after won't be comparable.
- **Fix a few things at a time** and re-evaluate. Scores move in steps, so small changes show up best one or two at a time.
- **Treat the score as a guide, not a grade.** A higher Better score means the design meets the rubric better. It doesn't promise more sales or sign-ups.

## When something goes wrong

| You see | What it means | What to do |
|---|---|---|
| "The site refused access (HTTP 403)" | The site blocks automated browsers | Try a different page, or fill in the brief yourself |
| "Page not found (HTTP 404)" | The URL is wrong | Check the address |
| "Private, local, reserved and metadata destinations are blocked" | The address isn't on the public internet | Use the public URL |
| "Setup needed" on the criteria | The AI judge isn't switched on | See "Scoring real websites" in the README |
| "A capture is already running" | Better scores one page at a time | Wait for the current run to finish |
