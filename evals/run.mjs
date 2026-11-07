#!/usr/bin/env node
// Better eval runner. Starts a fresh harness + web app, runs test cases a few
// times in a visible browser, and writes an HTML report. See evals/README.md.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const { values: opt } = parseArgs({
  options: {
    suite: { type: 'string', default: 'smoke' },
    only: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    judge: { type: 'string', default: 'fixture' },
    headless: { type: 'boolean', default: false },
    slow: { type: 'string', default: '200' },
    'harness-dir': { type: 'string', default: resolve(here, '../harness') },
    'web-dir': { type: 'string', default: resolve(here, '../apps/web') },
    'pages-base': { type: 'string', default: 'https://raw.githack.com/juancamilo994/Better/yitzy/eval-runner/evals/pages/' },
    'harness-port': { type: 'string', default: '3100' },
    'web-port': { type: 'string', default: '3101' },
    'keep-open': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (opt.help) {
  console.log(`Usage: npm run eval -- [--suite smoke|core|full] [--only id,id] [--repeat N] [--judge fixture|subq]
         [--headless] [--slow ms] [--harness-dir path] [--web-dir path] [--pages-base url] [--list]`);
  process.exit(0);
}

const spec = JSON.parse(await readFile(join(here, 'cases.json'), 'utf8'));
if (opt.list) {
  for (const c of spec.cases) console.log(`${c.id.padEnd(20)} ${c.group.padEnd(28)} ${c.title}`);
  for (const [s, ids] of Object.entries(spec.suites)) console.log(`suite ${s}: ${ids.join(', ')}`);
  process.exit(0);
}
const ids = opt.only ? opt.only.split(',') : spec.suites[opt.suite];
if (!ids) throw new Error(`Unknown suite ${opt.suite}`);
const cases = ids.map(id => spec.cases.find(c => c.id === id) ?? (() => { throw new Error(`Unknown case ${id}`); })());
const repeat = Math.max(1, Number(opt.repeat) || 1);
if (!['fixture', 'subq'].includes(opt.judge)) throw new Error('--judge must be fixture or subq');

// ---------- output ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(here, 'results', `${stamp}-${opt.suite}-${opt.judge}`);
await mkdir(join(outDir, 'shots'), { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

// ---------- servers ----------
const children = [];
function cleanup() { for (const c of children) { try { c.kill('SIGTERM'); } catch {} } }
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);

function waitFor(child, pattern, label, ms = 120_000) {
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`${label} did not start within ${ms / 1000}s`)), ms);
    let buf = '';
    const on = chunk => { buf += chunk; const m = buf.match(pattern); if (m) { clearTimeout(timer); ok(m); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
    child.once('exit', code => { clearTimeout(timer); fail(new Error(`${label} exited (${code}):\n${buf.slice(-2000)}`)); });
  });
}

const harnessDir = resolve(opt['harness-dir']);
const webDir = resolve(opt['web-dir']);
if (!existsSync(join(harnessDir, 'dist/server.js'))) throw new Error(`Harness not built at ${harnessDir}. Run: cd harness && npm ci && npm run build`);
if (!existsSync(join(webDir, 'package.json'))) throw new Error(`Web app not found at ${webDir}. Pass --web-dir.`);

// "Reset the memory": every eval run gets its own empty data directory.
const dataDir = await mkdtemp(join(tmpdir(), 'better-eval-'));
const HARNESS = `http://127.0.0.1:${opt['harness-port']}`;
const WEB = `http://127.0.0.1:${opt['web-port']}`;
log(`Fresh harness data dir: ${dataDir}`);
const harness = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/server.js'], {
  cwd: harnessDir,
  // Explicit env wins over harness/.env, so the eval never touches your real data or port.
  env: { ...process.env, PORT: opt['harness-port'], BETTER_DATA_DIR: dataDir, BETTER_JUDGE: opt.judge, BETTER_ALLOW_PAID_CALLS: opt.judge === 'subq' ? 'true' : 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(harness);
await waitFor(harness, /listening on/, 'Harness');
const health = await (await fetch(`${HARNESS}/api/health`)).json();
log(`Harness up: judge=${health.mode}, paid calls=${health.paidCallsEnabled}`);
if (opt.judge === 'subq' && !health.paidCallsEnabled) throw new Error('SubQ judge requested but paid calls are disabled.');

const web = spawn('npx', ['next', 'dev', '-p', opt['web-port'], '-H', '127.0.0.1'], {
  cwd: webDir, env: { ...process.env, HARNESS_URL: HARNESS, BETTER_MOCK_MODE: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(web);
await waitFor(web, /Ready in|ready started|Local:/i, 'Web app');
await fetch(WEB).catch(() => {});
log(`Web app up at ${WEB}`);

// ---------- browser ----------
const browser = await chromium.launch({ headless: opt.headless, slowMo: Number(opt.slow) || 0, args: ['--window-size=1400,900'] });
const ctx = await browser.newContext({ viewport: { width: 1380, height: 820 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
let shotN = 0;
async function shot(label) {
  const file = `shots/${String(++shotN).padStart(3, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`;
  await page.screenshot({ path: join(outDir, file), fullPage: false }).catch(() => {});
  return file;
}
async function banner(text) {
  // Shows what the runner is doing inside the watched browser window.
  await page.setContent(`<body style="margin:0;font:20px system-ui;background:#111;color:#eee;display:grid;place-items:center;height:100vh"><div style="max-width:900px;padding:40px"><div style="opacity:.6;font-size:14px">Better eval runner</div><h1 style="font-size:30px">${text.replace(/</g, '&lt;')}</h1></div></body>`).catch(() => {});
}

// ---------- harness API ----------
async function api(path, body) {
  const res = await fetch(HARNESS + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}
const profile = b => ({ version: 'profile-1', task: b.task, audience: b.audience, feeling: b.feeling, taste: b.taste ?? '', avoid: b.avoid ?? '', brand: b.brand ?? '' });
async function createProject(name, url, brief = spec.brief) {
  const r = await api('/api/projects', { name, url, profile: profile({ ...spec.brief, ...brief }) });
  if (!r.ok) throw new Error(`Create project failed (${r.status}): ${JSON.stringify(r.json)}`);
  return r.json.project ?? r.json;
}
async function evaluate(projectId, body = {}, label = '') {
  const started = Date.now();
  const r = await api(`/api/projects/${projectId}/runs`, body);
  const run = r.json.run ?? r.json;
  log(`  run ${label}: ${run.status ?? r.status} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  return run;
}
function summarize(run) {
  const vp = v => {
    const q = run.quality?.[v];
    if (!q) return null;
    return {
      subtotal: q.observedSubtotal, assessed: q.coverage?.assessedCriteria, of: q.coverage?.totalCriteria, rawTotal: q.rawTotal, cappedTotal: q.cappedTotal, capApplied: q.capApplied,
      points: Object.fromEntries((q.criteria ?? []).map(c => [c.id, c.points])),
      max: Object.fromEntries((q.criteria ?? []).map(c => [c.id, c.max])),
      dealBreakers: Object.fromEntries((q.dealBreakers ?? []).map(d => [d.id, d.verdict ?? 'unknown'])),
    };
  };
  const results = run.results ?? [];
  return {
    runId: run.id, status: run.status,
    desktop: vp('desktop'), mobile: vp('mobile'),
    judgeFailures: results.filter(x => x.status === 'failed').length,
    judgeAssessed: results.filter(x => x.provenance === 'subq' && x.status === 'assessed').length,
    measured: Object.fromEntries(results.filter(x => x.provenance === 'measured').map(x => [`${x.criterionId}:${x.viewport}`, x.score])),
  };
}
async function showRun(projectId, runId, label) {
  await page.goto(`${WEB}/projects/${projectId}?run=${runId}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(800);
  return shot(label);
}
async function showSite(url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(600);
  return shot(label);
}
const cmp = (a, b, test, detail) => (a === null || b === null ? { pass: null, detail: `${detail} (not scored in this judge mode)` } : { pass: test(a, b), detail });
const mean = a => { const n = a.filter(x => typeof x === 'number'); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null; };
const fmt = x => (x === null || x === undefined ? 'n/a' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const pageUrl = f => new URL(f, opt['pages-base']).toString();

// ---------- case kinds ----------
async function scorePage(name, url, brief, n, shots) {
  const project = await createProject(name, url, brief);
  const runs = [];
  for (let i = 1; i <= n; i++) {
    await banner(`Scoring ${name} (run ${i} of ${n})`);
    shots.push(await showSite(url, `${name}-site`));
    await banner(`Evaluating ${name}, run ${i} of ${n}. This takes up to a minute.`);
    const run = await evaluate(project.id, {}, `${name} #${i}`);
    runs.push(summarize(run));
    shots.push(await showRun(project.id, run.id, `${name}-score-${i}`));
  }
  return { project, runs };
}
const avgPoints = (runs, vp, id) => mean(runs.map(r => r[vp]?.points?.[id]));
const avgSubtotal = (runs, vp) => mean(runs.map(r => r[vp]?.subtotal));

const kinds = {
  async 'ui-loop'(c, ctxCase) {
    const checks = [];
    pageErrors.length = 0;
    await page.goto(WEB, { waitUntil: 'domcontentloaded' });
    ctxCase.shots.push(await shot('home'));
    await page.fill('input[name=name]', 'UI loop demo');
    await page.check('input[name=demo]');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/projects\/[^/]+\/onboarding/, { timeout: 30_000 });
    ctxCase.shots.push(await shot('onboarding'));
    checks.push({ name: 'Create project leads to onboarding', pass: true });
    await page.fill('input[name=task]', spec.brief.task);
    await page.fill('input[name=audience]', spec.brief.audience);
    await page.fill('input[name=feeling]', spec.brief.feeling);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/projects\/[^/?]+\?run=/, { timeout: 240_000 });
    await page.getByRole('heading', { name: /Overall/ }).waitFor({ timeout: 30_000 });
    ctxCase.shots.push(await shot('score'));
    checks.push({ name: 'Onboarding runs an evaluation and shows the score page', pass: true });
    await page.getByRole('link', { name: /See recommendations/ }).click();
    await page.getByRole('heading', { name: /Recommendations/ }).waitFor({ timeout: 30_000 });
    ctxCase.shots.push(await shot('recommendations'));
    const boxes = page.locator('input[type=checkbox]');
    const count = await boxes.count();
    checks.push({ name: 'Recommendations are offered', pass: count > 0, detail: `${count} suggestions` });
    if (count > 0) {
      // Each criterion has its own picker and button; select fixes in the first group.
      const group = page.locator('details').filter({ has: page.locator('input[type=checkbox]') }).first();
      const groupBoxes = group.locator('input[type=checkbox]');
      for (let i = 0; i < Math.min(2, await groupBoxes.count()); i++) await groupBoxes.nth(i).check();
      await group.getByRole('button', { name: /Add to prompt/ }).click();
      await page.waitForURL(/\/prompt\?/, { timeout: 30_000 });
      const text = await page.locator('main').innerText();
      ctxCase.shots.push(await shot('prompt'));
      checks.push({ name: 'Selected fixes produce a prompt', pass: text.length > 200, detail: `${text.length} chars on prompt page` });
      await page.locator('form button[type=submit]').last().click();
      await page.getByRole('heading', { name: /Runs \(2\)/ }).waitFor({ timeout: 240_000 });
      ctxCase.shots.push(await shot('reevaluated'));
      checks.push({ name: 'Reevaluate adds a second run to the history', pass: true });
    }
    const errs = pageErrors.filter(e => !/favicon|Download the React DevTools/i.test(e));
    checks.push({ name: 'No browser errors during the loop', pass: errs.length === 0, detail: errs.slice(0, 3).join(' | ') });
    return checks;
  },

  async stability(c, ctxCase) {
    const n = Math.max(c.minRepeats ?? 3, repeat);
    const { runs } = await scorePage('stability', pageUrl(c.page), {}, n, ctxCase.shots);
    ctxCase.runs = runs;
    const checks = [];
    for (const vp of ['desktop', 'mobile']) {
      const subs = runs.map(r => r[vp]?.subtotal).filter(x => typeof x === 'number');
      const spread = subs.length ? Math.max(...subs) - Math.min(...subs) : null;
      checks.push({ name: `${vp}: subtotal varies by at most ${c.maxSpread} points across ${n} runs`, pass: spread !== null && spread <= c.maxSpread, detail: `subtotals ${subs.join(', ') || 'none'}` });
      const cov = new Set(runs.map(r => r[vp]?.assessed));
      checks.push({ name: `${vp}: same number of criteria scored every run`, pass: cov.size === 1, detail: `assessed ${[...runs.map(r => r[vp]?.assessed)].join(', ')}` });
    }
    checks.push({ name: 'No failed judge calls', pass: runs.every(r => r.judgeFailures === 0), detail: `failures per run: ${runs.map(r => r.judgeFailures).join(', ')}` });
    return checks;
  },

  async pair(c, ctxCase) {
    const bad = await scorePage(`${c.id}-bad`, pageUrl(c.bad), {}, repeat, ctxCase.shots);
    const good = await scorePage(`${c.id}-clean`, pageUrl(c.good), {}, repeat, ctxCase.shots);
    ctxCase.runs = { bad: bad.runs, clean: good.runs };
    const checks = [];
    for (const vp of ['desktop', 'mobile']) {
      for (const id of c.lowerOn ?? []) {
        const b = avgPoints(bad.runs, vp, id), g = avgPoints(good.runs, vp, id);
        checks.push({ name: `${vp}: ${id} scores lower on the bad page`, ...cmp(b, g, (x, y) => x < y, `bad ${fmt(b)} vs clean ${fmt(g)}`) });
      }
      for (const id of c.dealBreakerFails ?? []) {
        const bv = bad.runs.map(r => r[vp]?.dealBreakers?.[id]); const gv = good.runs.map(r => r[vp]?.dealBreakers?.[id]);
        checks.push({ name: `${vp}: ${id} deal-breaker fails on the bad page`, pass: bv.every(v => v === 'fail'), detail: `bad: ${bv.join(', ')}` });
        checks.push({ name: `${vp}: ${id} deal-breaker does not fail on the clean page`, pass: gv.every(v => v !== 'fail'), detail: `clean: ${gv.join(', ')}` });
      }
      const bs = avgSubtotal(bad.runs, vp), gs = avgSubtotal(good.runs, vp);
      const ba = mean(bad.runs.map(r => r[vp]?.assessed)), ga = mean(good.runs.map(r => r[vp]?.assessed));
      checks.push({ name: `${vp}: bad page subtotal is lower`, ...cmp(bs, gs, (x, y) => x < y, `bad ${fmt(bs)} (${fmt(ba)} criteria) vs clean ${fmt(gs)} (${fmt(ga)} criteria)`) });
    }
    return checks;
  },

  async 'improve-demo'(c, ctxCase) {
    const r = await api('/api/projects', { name: 'improve-demo', demo: true });
    const project = r.json.project ?? r.json;
    await banner('Demo site: scoring the broken baseline version');
    const base = summarize(await evaluate(project.id, { demoVersion: 'baseline' }, 'demo baseline'));
    ctxCase.shots.push(await showRun(project.id, base.runId, 'demo-baseline'));
    await banner('Demo site: scoring the fixed version at the same URL');
    const fixed = summarize(await evaluate(project.id, { demoVersion: 'revised' }, 'demo revised'));
    ctxCase.shots.push(await showRun(project.id, fixed.runId, 'demo-revised'));
    ctxCase.runs = { baseline: base, revised: fixed };
    const m = (s, k) => s.measured[k];
    return [
      { name: 'Mobile overflow check improves after the fix', pass: (m(fixed, 'LAY-01:mobile') ?? 0) > (m(base, 'LAY-01:mobile') ?? 0), detail: `LAY-01 mobile ${fmt(m(base, 'LAY-01:mobile'))} -> ${fmt(m(fixed, 'LAY-01:mobile'))}` },
      { name: 'Small-text check improves after the fix', pass: (m(fixed, 'TYPE-01:mobile') ?? 0) > (m(base, 'TYPE-01:mobile') ?? 0), detail: `TYPE-01 mobile ${fmt(m(base, 'TYPE-01:mobile'))} -> ${fmt(m(fixed, 'TYPE-01:mobile'))}` },
      { name: 'Mobile Typography points do not drop', ...cmp(base.mobile?.points?.TYPOGRAPHY ?? null, fixed.mobile?.points?.TYPOGRAPHY ?? null, (a, b) => b >= a, `${fmt(base.mobile?.points?.TYPOGRAPHY)} -> ${fmt(fixed.mobile?.points?.TYPOGRAPHY)}`) },
      { name: 'Mobile subtotal does not drop', ...cmp(base.mobile?.subtotal ?? null, fixed.mobile?.subtotal ?? null, (a, b) => b >= a, `${fmt(base.mobile?.subtotal)} -> ${fmt(fixed.mobile?.subtotal)}`) },
    ];
  },

  async 'mobile-only'(c, ctxCase) {
    const { runs } = await scorePage('mobile-only', pageUrl(c.page), {}, repeat, ctxCase.shots);
    ctxCase.runs = runs;
    const lay = vp => mean(runs.map(r => r.measured[`LAY-01:${vp}`]));
    return [
      { name: 'Overflow check fails on mobile but passes on desktop', pass: lay('mobile') !== null && lay('desktop') !== null && lay('mobile') < lay('desktop'), detail: `LAY-01 desktop ${fmt(lay('desktop'))}, mobile ${fmt(lay('mobile'))}` },
      { name: 'Mobile reflow deal-breaker flagged', pass: runs.every(r => r.mobile?.dealBreakers?.MOBILE_REFLOW === 'fail'), detail: runs.map(r => r.mobile?.dealBreakers?.MOBILE_REFLOW).join(', ') },
      { name: 'Mobile subtotal is lower than desktop', ...cmp(avgSubtotal(runs, 'mobile'), avgSubtotal(runs, 'desktop'), (m, d) => m < d, `desktop ${fmt(avgSubtotal(runs, 'desktop'))}, mobile ${fmt(avgSubtotal(runs, 'mobile'))}`) },
    ];
  },

  async honest(c, ctxCase) {
    await banner(`Honesty check: ${c.url}`);
    const r = await api('/api/projects', { name: c.id, url: c.url, profile: profile(spec.brief) });
    if (!r.ok) {
      ctxCase.shots.push(await shot(c.id));
      return [{ name: 'Rejected up front with a clear message', pass: true, detail: `${r.status}: ${r.json.error ?? JSON.stringify(r.json)}` }];
    }
    if (c.expectRejected) return [{ name: 'Rejected up front', pass: false, detail: `Accepted with status ${r.status}` }];
    const project = r.json.project ?? r.json;
    const run = summarize(await evaluate(project.id, {}, c.id));
    ctxCase.shots.push(await showRun(project.id, run.runId, c.id));
    ctxCase.runs = run;
    return [
      { name: 'Run is marked failed, not scored', pass: run.status === 'failed', detail: `status ${run.status}` },
      { name: 'No scores invented', pass: !run.desktop?.subtotal && !run.mobile?.subtotal, detail: `subtotals ${fmt(run.desktop?.subtotal)}, ${fmt(run.mobile?.subtotal)}` },
    ];
  },

  async 'real-world'(c, ctxCase) {
    const out = {};
    for (const s of c.sites) {
      try { out[s.name] = (await scorePage(s.name, s.url, s.brief, repeat, ctxCase.shots)).runs; }
      catch (e) { out[s.name] = { error: String(e.message) }; }
    }
    ctxCase.runs = out;
    const checks = Object.entries(out).map(([n, runs]) => ({ name: `${n}: recorded`, pass: null, detail: Array.isArray(runs) ? `desktop ${fmt(avgSubtotal(runs, 'desktop'))} (${fmt(mean(runs.map(r => r.desktop?.assessed)))} criteria), mobile ${fmt(avgSubtotal(runs, 'mobile'))}` : runs.error }));
    const [hi, lo] = c.expectOrder;
    if (Array.isArray(out[hi]) && Array.isArray(out[lo])) checks.push({ name: `${hi} scores above ${lo} on desktop (informational)`, pass: null, detail: `${fmt(avgSubtotal(out[hi], 'desktop'))} vs ${fmt(avgSubtotal(out[lo], 'desktop'))}` });
    return checks;
  },
};

// ---------- run ----------
log(`Suite "${opt.suite}" with ${cases.length} cases, repeat=${repeat}, judge=${opt.judge}`);
const report = [];
for (const c of cases) {
  const ctxCase = { shots: [], runs: null };
  const started = Date.now();
  log(`> ${c.id}: ${c.title}`);
  let checks;
  try { checks = await kinds[c.kind](c, ctxCase); }
  catch (e) { checks = [{ name: 'Case ran to completion', pass: false, detail: String(e.message).slice(0, 500) }]; ctxCase.shots.push(await shot(`${c.id}-error`)); }
  const scored = checks.filter(k => k.pass !== null);
  const status = scored.length === 0 ? 'info' : scored.every(k => k.pass) ? 'pass' : 'fail';
  for (const k of checks) log(`    ${k.pass === null ? 'SKIP' : k.pass ? 'PASS' : 'FAIL'}  ${k.name}${k.detail ? `  (${k.detail})` : ''}`);
  log(`< ${c.id}: ${status.toUpperCase()} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  report.push({ ...c, status, checks, shots: ctxCase.shots, runs: ctxCase.runs, seconds: Math.round((Date.now() - started) / 1000) });
}

// ---------- report ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const counts = { pass: 0, fail: 0, info: 0 };
for (const r of report) counts[r.status]++;
const meta = { startedAt: new Date(t0).toISOString(), suite: opt.suite, judge: opt.judge, repeat, seconds: Math.round((Date.now() - t0) / 1000), counts, harnessHealth: health };
await writeFile(join(outDir, 'results.json'), JSON.stringify({ meta, cases: report }, null, 2));
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Better eval report</title><style>
:root{--bg:#fbfaf7;--fg:#1b1d1c;--muted:#666;--card:#fff;--line:#e3e0d8;--pass:#1d7a46;--fail:#b3261e;--info:#5b5b8a}
@media (prefers-color-scheme:dark){:root{--bg:#141514;--fg:#ecebe6;--muted:#9a9a94;--card:#1d1f1d;--line:#30322f;--pass:#5fc48a;--fail:#ff8a80;--info:#a9a9e0}}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:24px 16px}
h1{font-size:26px;margin:0 0 4px}.sum{color:var(--muted);margin-bottom:20px}.case{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:14px 0}
.tag{font-weight:700;font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid currentColor;margin-right:8px}.pass{color:var(--pass)}.fail{color:var(--fail)}.info{color:var(--info)}
.group{color:var(--muted);font-size:13px}ul{padding-left:18px}li{margin:3px 0}.d{color:var(--muted)}.shots{display:flex;gap:8px;overflow-x:auto;padding-top:8px}.shots img{height:120px;border:1px solid var(--line);border-radius:6px}
details{margin-top:8px}pre{white-space:pre-wrap;font-size:12px;max-height:300px;overflow:auto;background:var(--bg);padding:8px;border-radius:6px}</style></head><body><main>
<h1>Better eval report</h1><div class="sum">Suite <b>${esc(opt.suite)}</b>, judge <b>${esc(opt.judge)}</b>, repeat ${repeat}, ${meta.seconds}s. <span class="pass">${counts.pass} passed</span>, <span class="fail">${counts.fail} failed</span>, <span class="info">${counts.info} informational</span>. ${esc(meta.startedAt)}</div>
${report.map(r => `<section class="case"><div><span class="tag ${r.status}">${r.status.toUpperCase()}</span><b>${esc(r.title)}</b></div><div class="group">${esc(r.group)} · ${esc(r.id)} · ${r.seconds}s</div>
<ul>${r.checks.map(k => `<li><span class="${k.pass === null ? 'info' : k.pass ? 'pass' : 'fail'}">${k.pass === null ? 'INFO' : k.pass ? 'PASS' : 'FAIL'}</span> ${esc(k.name)} <span class="d">${esc(k.detail)}</span></li>`).join('')}</ul>
<div class="shots">${r.shots.map(s => `<a href="${esc(s)}"><img src="${esc(s)}" alt="${esc(s)}"></a>`).join('')}</div>
${r.runs ? `<details><summary>Raw run summaries</summary><pre>${esc(JSON.stringify(r.runs, null, 2))}</pre></details>` : ''}</section>`).join('')}
</main></body></html>`;
await writeFile(join(outDir, 'report.html'), html);
log(`Done: ${counts.pass} pass, ${counts.fail} fail, ${counts.info} info. Report: ${join(outDir, 'report.html')}`);

if (opt['keep-open']) { log('Browser left open; press Ctrl+C to finish.'); await new Promise(() => {}); }
await browser.close();
cleanup();
await rm(dataDir, { recursive: true, force: true }).catch(() => {});
if (!opt.headless) spawn('open', [join(outDir, 'report.html')], { stdio: 'ignore', detached: true }).unref();
process.exit(counts.fail ? 1 : 0);
