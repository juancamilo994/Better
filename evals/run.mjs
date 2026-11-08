#!/usr/bin/env node
// Better eval runner. Starts a fresh harness (and the web app when a case needs it),
// runs each test case in a visible browser "stage" that shows the question, the
// pages side by side, the scores as bars and a plain verdict, then writes an HTML
// report and appends the results to evals/TEST-LOG.md. See evals/README.md.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, appendFile } from 'node:fs/promises';
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
    hold: { type: 'string', default: '4' },
    'harness-dir': { type: 'string', default: resolve(here, '../harness') },
    'web-dir': { type: 'string', default: resolve(here, '../apps/web') },
    'pages-base': { type: 'string', default: 'https://raw.githack.com/juancamilo994/Better/main/evals/pages/' },
    'harness-port': { type: 'string', default: '3100' },
    'web-port': { type: 'string', default: '3101' },
    'no-log': { type: 'boolean', default: false },
    list: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});
if (opt.help) {
  console.log(`Usage: npm run eval -- [--suite smoke|core|full] [--only id,id] [--repeat N] [--judge fixture|subq]
         [--headless] [--hold seconds] [--harness-dir path] [--web-dir path] [--pages-base url] [--no-log] [--list]`);
  process.exit(0);
}
const spec = JSON.parse(await readFile(join(here, 'cases.json'), 'utf8'));
if (opt.list) {
  for (const c of spec.cases) console.log(`${c.id.padEnd(20)} ${c.question}`);
  for (const [s, ids] of Object.entries(spec.suites)) console.log(`suite ${s}: ${ids.join(', ')}`);
  process.exit(0);
}
const ids = opt.only ? opt.only.split(',') : spec.suites[opt.suite];
if (!ids) throw new Error(`Unknown suite ${opt.suite}`);
const cases = ids.map(id => spec.cases.find(c => c.id === id) ?? (() => { throw new Error(`Unknown case ${id}`); })());
const repeat = Math.max(1, Number(opt.repeat) || 1);
const holdMs = Math.max(0, Number(opt.hold) || 0) * 1000;
if (!['fixture', 'subq'].includes(opt.judge)) throw new Error('--judge must be fixture or subq');
const suiteName = opt.only ? 'custom' : opt.suite;

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(here, 'results', `${stamp}-${suiteName}-${opt.judge}`);
await mkdir(join(outDir, 'shots'), { recursive: true });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);

// ---------- servers ----------
const children = [];
const cleanup = () => { for (const c of children) { try { c.kill('SIGTERM'); } catch {} } };
process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('exit', cleanup);
function waitFor(child, pattern, label, ms = 120_000) {
  return new Promise((ok, fail) => {
    const timer = setTimeout(() => fail(new Error(`${label} did not start within ${ms / 1000}s`)), ms);
    let buf = '';
    const on = chunk => { buf += chunk; if (pattern.test(buf)) { clearTimeout(timer); ok(); } };
    child.stdout.on('data', on); child.stderr.on('data', on);
    child.once('exit', code => { clearTimeout(timer); fail(new Error(`${label} exited (${code}):\n${buf.slice(-2000)}`)); });
  });
}
const harnessDir = resolve(opt['harness-dir']);
const webDir = resolve(opt['web-dir']);
if (!existsSync(join(harnessDir, 'dist/server.js'))) throw new Error(`Harness not built at ${harnessDir}. Run: cd harness && npm ci && npm run build`);
const needsWeb = cases.some(c => c.kind === 'ui-loop');
if (needsWeb && !existsSync(join(webDir, 'node_modules'))) throw new Error(`Web app not installed at ${webDir}. Run: cd apps/web && npm install (or pass --web-dir).`);

// "Reset the memory": every eval run starts from an empty harness data directory.
const dataDir = await mkdtemp(join(tmpdir(), 'better-eval-'));
const HARNESS = `http://127.0.0.1:${opt['harness-port']}`;
const WEB = `http://127.0.0.1:${opt['web-port']}`;
log(`Fresh harness data dir: ${dataDir}`);
const harness = spawn(process.execPath, ['--env-file-if-exists=.env', 'dist/server.js'], {
  cwd: harnessDir,
  env: { ...process.env, PORT: opt['harness-port'], BETTER_DATA_DIR: dataDir, BETTER_JUDGE: opt.judge, BETTER_ALLOW_PAID_CALLS: opt.judge === 'subq' ? 'true' : 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
children.push(harness);
await waitFor(harness, /listening on/, 'Harness');
const health = await (await fetch(`${HARNESS}/api/health`)).json();
log(`Harness up: judge=${health.mode}, paid calls=${health.paidCallsEnabled}`);
if (opt.judge === 'subq' && !health.paidCallsEnabled) throw new Error('SubQ judge requested but paid calls are disabled.');
const rubric = await (await fetch(`${HARNESS}/api/rubric`)).json();
const titles = Object.fromEntries((rubric.axes ?? []).map(a => [a.id, a.title]));
if (needsWeb) {
  const web = spawn('npx', ['next', 'dev', '-p', opt['web-port'], '-H', '127.0.0.1'], { cwd: webDir, env: { ...process.env, HARNESS_URL: HARNESS, BETTER_MOCK_MODE: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(web);
  await waitFor(web, /Ready in|Local:/i, 'Web app');
  await fetch(WEB).catch(() => {});
  log(`Web app up at ${WEB}`);
}

// ---------- browser ----------
// If the watched window is closed mid-run, a new one opens instead of crashing the run.
let browser, page;
const pageErrors = [];
async function openWindow() {
  try { await browser?.close(); } catch {}
  browser = await chromium.launch({ headless: opt.headless, args: ['--window-size=1440,960'] });
  page = await (await browser.newContext({ viewport: { width: 1420, height: 860 } })).newPage();
  page.on('pageerror', e => pageErrors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });
}
await openWindow();
async function livePage() { if (!browser.isConnected() || page.isClosed()) { log('Browser window was closed; opening a new one.'); await openWindow(); } return page; }
const pause = async ms => { try { await (await livePage()).waitForTimeout(ms); } catch {} };
let shotN = 0;
async function shot(label) {
  await livePage();
  const file = `shots/${String(++shotN).padStart(3, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`;
  await page.screenshot({ path: join(outDir, file), fullPage: true }).catch(() => {});
  return file;
}

// ---------- harness API ----------
async function api(path, body) {
  const res = await fetch(HARNESS + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}
const profile = b => ({ version: 'profile-1', task: b.task, audience: b.audience, feeling: b.feeling, taste: b.taste ?? '', avoid: b.avoid ?? '', brand: b.brand ?? '' });
async function createProject(name, url, brief = {}) {
  const r = await api('/api/projects', { name, url, profile: profile({ ...spec.brief, ...brief }) });
  if (!r.ok) throw new Error(`Create project failed (${r.status}): ${r.json.error ?? JSON.stringify(r.json)}`);
  return r.json.project ?? r.json;
}
async function evaluate(projectId, body = {}, label = '') {
  const started = Date.now();
  const r = await api(`/api/projects/${projectId}/runs`, body);
  const run = r.json.run ?? r.json;
  log(`  ${label}: ${run.status ?? r.status} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  return run;
}
async function screenshotOf(run, viewport) {
  const cap = (run.captures ?? []).find(c => c.viewport === viewport && c.status === 'ready');
  const art = cap?.artifacts?.find(a => a.kind === 'screenshot');
  if (!art) return null;
  const res = await fetch(`${HARNESS}/api/runs/${run.id}/evidence/${encodeURIComponent(art.id)}`);
  if (!res.ok) return null;
  return `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}
function summarize(run) {
  const vp = v => {
    const q = run.quality?.[v];
    if (!q) return null;
    return {
      subtotal: q.observedSubtotal, assessed: q.coverage?.assessedCriteria, of: q.coverage?.totalCriteria,
      criteria: (q.criteria ?? []).map(c => ({ id: c.id, title: c.title ?? titles[c.id] ?? c.id, max: c.max, points: c.points })),
      points: Object.fromEntries((q.criteria ?? []).map(c => [c.id, c.points])),
      dealBreakers: Object.fromEntries((q.dealBreakers ?? []).map(d => [d.id, d.verdict ?? 'unknown'])),
    };
  };
  const results = run.results ?? [];
  return {
    runId: run.id, status: run.status, reason: (run.captures ?? []).find(c => c.status === 'failed')?.reason,
    desktop: vp('desktop'), mobile: vp('mobile'),
    judgeFailures: (run.judgeAttempts ?? []).filter(a => a.status === 'failed').length,
    measured: Object.fromEntries(results.filter(x => x.provenance === 'measured').map(x => [`${x.criterionId}:${x.viewport}`, x.score])),
  };
}
const mean = a => { const n = a.filter(x => typeof x === 'number'); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : null; };
const fmt = x => (x === null || x === undefined ? 'n/a' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const cmp = (a, b, test, detail) => (a === null || b === null ? { pass: null, detail: `${detail} (not scored in this judge mode)` } : { pass: test(a, b), detail });
const pageUrl = f => new URL(f, opt['pages-base']).toString();
const titleOf = id => titles[id] ?? id;

// ---------- the stage ----------
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const STYLE = `
:root{--bg:#f7f5f0;--fg:#1c1d1b;--muted:#6b6a64;--card:#fff;--line:#e2ded4;--bar:#cfcac0;--fill:#3d5a80;--focus:#c2410c;--pass:#15803d;--fail:#b91c1c;--skip:#6b6a64;--chip:#f1eee7}
@media (prefers-color-scheme:dark){:root{--bg:#121311;--fg:#ecebe6;--muted:#9c9a92;--card:#1c1d1a;--line:#30312d;--bar:#3a3b36;--fill:#7aa2d6;--focus:#fb923c;--pass:#4ade80;--fail:#f87171;--skip:#9c9a92;--chip:#262722}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 ui-sans-serif,system-ui,sans-serif}
.stage{max-width:1380px;margin:0 auto;padding:22px 24px}
.top{display:flex;justify-content:space-between;color:var(--muted);font-size:13px;letter-spacing:.02em}
h1{font-size:28px;line-height:1.2;margin:6px 0 4px;max-width:1000px}.why{color:var(--muted);margin:0 0 6px;max-width:1000px}
.exp{font-size:13px;color:var(--muted);margin-bottom:14px}.exp b{color:var(--fg);font-weight:600}
.panels{display:grid;gap:16px}.panel{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;min-width:0}
.plabel{font-weight:650;margin-bottom:2px}.psub{color:var(--muted);font-size:12px;margin-bottom:8px;overflow-wrap:anywhere}
.shot.phone{object-fit:contain;background:var(--chip)}.shot{width:100%;height:230px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--line);background:var(--chip);display:block}
.wait{height:230px;border-radius:8px;border:1px dashed var(--line);display:grid;place-items:center;color:var(--muted);text-align:center;padding:16px}
.total{display:flex;align-items:baseline;gap:8px;margin:10px 0 6px}.total b{font-size:26px}.total span{color:var(--muted);font-size:12px}
.bars{display:grid;gap:3px}.row{display:grid;grid-template-columns:130px 1fr 44px;gap:8px;align-items:center;font-size:12px}
.row .t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}.row.f .t{color:var(--focus);font-weight:700}
.track{height:9px;background:var(--bar);border-radius:5px;overflow:hidden}.fillb{display:block;height:100%;background:var(--fill)}.row.f .fillb{background:var(--focus)}
.row .v{text-align:right;font-variant-numeric:tabular-nums}.unk .track{background:repeating-linear-gradient(45deg,var(--bar) 0 4px,transparent 4px 8px)}
.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.chip{font-size:11px;padding:2px 7px;border-radius:99px;background:var(--chip)}.chip.fail{color:var(--fail);font-weight:650}
.verdict{margin-top:16px;border-radius:12px;padding:14px 16px;border:2px solid var(--line);background:var(--card);font-size:17px}
.verdict.pass{border-color:var(--pass)}.verdict.fail{border-color:var(--fail)}.verdict.skip,.verdict.info{border-color:var(--skip)}
.verdict .tag{font-weight:800;margin-right:8px}.verdict.pass .tag{color:var(--pass)}.verdict.fail .tag{color:var(--fail)}.verdict.skip .tag,.verdict.info .tag{color:var(--skip)}
.checks{margin:8px 0 0;padding-left:18px;font-size:13px;color:var(--muted)}.checks .ok{color:var(--pass)}.checks .no{color:var(--fail)}
.summary .q{display:grid;grid-template-columns:90px 1fr;gap:10px;padding:10px 0;border-top:1px solid var(--line)}.summary .a{font-weight:800}
.a.pass{color:var(--pass)}.a.fail{color:var(--fail)}.a.skip,.a.info{color:var(--skip)}
@media (max-width:700px){.stage{padding:16px}.panels{grid-template-columns:1fr!important}.row{grid-template-columns:96px 1fr 40px}}`;

function panelHtml(p, focus = []) {
  const body = p.img ? `<img class="shot${p.phone ? ' phone' : ''}" src="${p.img}" alt="${esc(p.label)}">` : `<div class="wait">${esc(p.note ?? 'Waiting')}</div>`;
  const s = p.score;
  const scores = s ? `<div class="total"><b>${fmt(s.subtotal)}</b><span>points from ${fmt(s.assessed)} of ${fmt(s.of)} criteria scored</span></div>
<div class="bars">${s.criteria.map(c => `<div class="row${focus.includes(c.id) ? ' f' : ''}${c.points === null ? ' unk' : ''}"><span class="t">${esc(c.title)}</span><span class="track"><span class="fillb" style="width:${c.points === null ? 0 : Math.round(100 * c.points / c.max)}%"></span></span><span class="v">${c.points === null ? 'n/a' : `${fmt(c.points)}/${c.max}`}</span></div>`).join('')}</div>
<div class="chips">${Object.entries(s.dealBreakers).filter(([k, v]) => v === 'fail' && !(p.phone === false && k === 'MOBILE_REFLOW')).map(([k, v]) => `<span class="chip ${v}">${esc(k.replace(/_/g, ' ').toLowerCase())}: ${esc(v)}</span>`).join('') || '<span class="chip">no deal-breaker failures</span>'}</div>` : (p.img && p.note ? `<p class="psub">${esc(p.note)}</p>` : '');
  return `<div class="panel"><div class="plabel">${esc(p.label)}</div><div class="psub">${esc(p.sub ?? '')}</div>${body}${scores}</div>`;
}
function stageHtml(st) {
  const cols = Math.min(Math.max(st.panels.length, 1), 3);
  const verdict = st.verdict ? `<div class="verdict ${st.verdict.status}"><span class="tag">${{ pass: 'YES', fail: 'NO', skip: "CAN'T TELL", info: 'RECORDED' }[st.verdict.status]}</span>${esc(st.verdict.text)}
<ul class="checks">${(st.checks ?? []).map(k => `<li class="${k.pass === null ? '' : k.pass ? 'ok' : 'no'}">${k.pass === null ? 'skipped' : k.pass ? 'met' : 'missed'}: ${esc(k.name)}${k.detail ? ` (${esc(k.detail)})` : ''}</li>`).join('')}</ul></div>` : '';
  return `<section class="stage"><div class="top"><span>Test ${st.n} of ${st.total} · ${esc(st.group)}</span><span>${esc(st.status ?? '')}</span></div>
<h1>${esc(st.question)}</h1><p class="why">${esc(st.why)}</p><div class="exp"><b>Expected before running:</b> ${esc(st.expected)}</div>
<div class="panels" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${st.panels.map(p => panelHtml(p, st.focus)).join('')}</div>${verdict}</section>`;
}
const doc = (title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${inner}</body></html>`;
async function show(st) { await livePage(); await page.setContent(doc('Better eval', stageHtml(st)), { waitUntil: 'load' }).catch(() => {}); }

// ---------- case kinds ----------
// Each kind fills st.panels as it goes (re-rendering the stage), then returns checks and a verdict sentence.
function averageScore(runs, vp) {
  const first = runs.find(r => r[vp])?.[vp];
  if (!first) return null;
  return {
    subtotal: mean(runs.map(r => r[vp]?.subtotal)), assessed: mean(runs.map(r => r[vp]?.assessed)), of: first.of,
    criteria: first.criteria.map(c => ({ ...c, points: mean(runs.map(r => r[vp]?.points?.[c.id])) })),
    dealBreakers: first.dealBreakers,
  };
}
async function scorePanel(st, panel, name, url, brief, label) {
  panel.note = 'Better is capturing and scoring this page...'; panel.img = null; panel.score = null;
  await show(st);
  const project = await createProject(name, url, brief);
  const runs = [];
  for (let i = 1; i <= repeat; i++) {
    st.status = `${label}: run ${i} of ${repeat}`; await show(st);
    const run = await evaluate(project.id, {}, `${name} #${i}`);
    const s = summarize(run);
    runs.push(s);
    panel.img = (await screenshotOf(run, 'desktop')) ?? panel.img;
    panel.note = run.status === 'failed' ? `Capture failed: ${s.reason ?? ''}` : null;
    panel.score = averageScore(runs, 'desktop');
    await show(st);
  }
  return runs;
}
const avgPoints = (runs, vp, id) => mean(runs.map(r => r[vp]?.points?.[id]));
const avgSubtotal = (runs, vp) => mean(runs.map(r => r[vp]?.subtotal));

const kinds = {
  async 'ui-loop'(c, st) {
    const checks = [];
    pageErrors.length = 0;
    const steps = [];
    const step = async label => { steps.push({ label, img: `data:image/png;base64,${(await page.screenshot()).toString('base64')}` }); };
    await page.goto(WEB, { waitUntil: 'domcontentloaded' });
    await step('1. Home');
    await page.fill('input[name=name]', 'UI loop demo');
    await page.check('input[name=demo]');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/projects\/[^/]+\/onboarding/, { timeout: 30_000 });
    checks.push({ name: 'Create project leads to onboarding', pass: true });
    await page.fill('input[name=task]', spec.brief.task);
    await page.fill('input[name=audience]', spec.brief.audience);
    await page.fill('input[name=feeling]', spec.brief.feeling);
    await page.click('button[type=submit]');
    await page.waitForURL(/\/projects\/[^/?]+\?run=/, { timeout: 240_000 });
    await page.getByRole('heading', { name: /Overall/ }).first().waitFor({ timeout: 30_000 });
    await step('2. Score');
    checks.push({ name: 'Onboarding runs an evaluation and shows the score page', pass: true });
    await page.getByRole('link', { name: /See recommendations/ }).first().click();
    await page.getByRole('heading', { name: /Recommendations/ }).first().waitFor({ timeout: 30_000 });
    const count = await page.locator('input[type=checkbox]').count();
    await step('3. Recommendations');
    checks.push({ name: 'Recommendations are offered', pass: count > 0, detail: `${count} suggestions` });
    if (count > 0) {
      const group = page.locator('details').filter({ has: page.locator('input[type=checkbox]') }).first();
      const boxes = group.locator('input[type=checkbox]');
      for (let i = 0; i < Math.min(2, await boxes.count()); i++) await boxes.nth(i).check();
      await group.getByRole('button', { name: /Add to prompt/ }).click();
      await page.waitForURL(/\/prompt\?/, { timeout: 30_000 });
      const text = await page.locator('main').innerText();
      await step('4. Prompt');
      checks.push({ name: 'Selected fixes produce a prompt', pass: text.length > 200, detail: `${text.length} characters` });
      await page.locator('form button[type=submit]').last().click();
      await page.getByRole('heading', { name: /Runs \(2\)/ }).waitFor({ timeout: 240_000 });
      await step('5. Reevaluated');
      checks.push({ name: 'Reevaluate adds a second run to the history', pass: true });
    }
    const errs = pageErrors.filter(e => !/favicon|React DevTools/i.test(e));
    checks.push({ name: 'No browser errors', pass: errs.length === 0, detail: errs.slice(0, 2).join(' | ') });
    st.panels = steps.slice(-3).map(s => ({ label: s.label, img: s.img }));
    const ok = checks.every(k => k.pass);
    return { checks, text: ok ? 'A user can go from a URL to a copyable prompt and back to a new score with no errors.' : 'The product loop broke; see the missed step below.' };
  },

  async pair(c, st) {
    st.focus = c.focus ?? [];
    const A = { label: c.badLabel, sub: c.bad }, B = { label: c.goodLabel, sub: c.good };
    st.panels = [A, B];
    const bad = await scorePanel(st, A, `${c.id}-bad`, pageUrl(c.bad), {}, 'Broken page');
    const good = await scorePanel(st, B, `${c.id}-clean`, pageUrl(c.good), {}, 'Clean page');
    const checks = [];
    const lines = [];
    for (const vp of ['desktop', 'mobile']) {
      for (const id of c.focus ?? []) {
        const b = avgPoints(bad, vp, id), g = avgPoints(good, vp, id);
        checks.push({ name: `${vp}: ${titleOf(id)} scores lower on the broken page`, ...cmp(b, g, (x, y) => x < y, `broken ${fmt(b)} vs clean ${fmt(g)}`) });
        if (vp === 'desktop') lines.push(`${titleOf(id)} ${fmt(b)} vs ${fmt(g)}`);
      }
      if (c.dealBreaker) {
        const name = c.dealBreaker.replace(/_/g, ' ').toLowerCase();
        const bv = bad.map(r => r[vp]?.dealBreakers?.[c.dealBreaker]); const gv = good.map(r => r[vp]?.dealBreakers?.[c.dealBreaker]);
        checks.push({ name: `${vp}: ${name} fails on the broken page`, pass: bv.every(v => v === 'fail'), detail: `broken: ${bv.join(', ')}` });
        checks.push({ name: `${vp}: ${name} does not fail on the clean page`, pass: gv.every(v => v !== 'fail'), detail: `clean: ${gv.join(', ')}` });
      }
      const bs = avgSubtotal(bad, vp), gs = avgSubtotal(good, vp);
      checks.push({ name: `${vp}: broken page gets the lower subtotal`, ...cmp(bs, gs, (x, y) => x < y, `broken ${fmt(bs)} vs clean ${fmt(gs)}`) });
      if (vp === 'desktop' && bs !== null && gs !== null) lines.push(`subtotal ${fmt(bs)} vs ${fmt(gs)}`);
    }
    const scored = checks.filter(k => k.pass !== null);
    const allOk = scored.length && scored.every(k => k.pass);
    const judged = checks.some(k => k.pass !== null && / scores lower | lower subtotal/.test(k.name));
    const flagged = c.dealBreaker ? `flagged ${c.dealBreaker.replace(/_/g, ' ').toLowerCase()} on the broken page only` : '';
    const text = !scored.length ? 'The AI judge is off in this mode, so only measured checks ran.'
      : allOk && !judged ? `Better's measurements ${flagged || 'caught the problem'}; the AI judge is off, so its scores weren't tested.`
      : allOk ? `Better scored the broken page lower where it should (laptop: ${lines.join('; ')}).`
      : `Better did not reliably score the broken page lower (laptop: ${lines.join('; ') || 'see checks'}). Its judgment on this problem can't be trusted yet.`;
    return { checks, text };
  },

  async 'improve-demo'(c, st) {
    const r = await api('/api/projects', { name: 'improve-demo', demo: true });
    const project = r.json.project ?? r.json;
    const A = { label: 'Before: broken demo', sub: 'built-in demo, baseline version, phone view', phone: true }, B = { label: 'After: fixed demo', sub: 'same URL, fixed version, phone view', phone: true };
    st.panels = [A, B]; st.focus = ['TYPOGRAPHY', 'USABILITY'];
    A.note = 'Scoring the broken version...'; await show(st);
    const baseRun = await evaluate(project.id, { demoVersion: 'baseline' }, 'demo baseline');
    const base = summarize(baseRun); A.img = await screenshotOf(baseRun, 'mobile'); A.score = averageScore([base], 'mobile'); A.note = null;
    B.note = 'Scoring the fixed version...'; await show(st);
    const fixedRun = await evaluate(project.id, { demoVersion: 'revised' }, 'demo revised');
    const fixed = summarize(fixedRun); B.img = await screenshotOf(fixedRun, 'mobile'); B.score = averageScore([fixed], 'mobile'); B.note = null;
    const m = (s, k) => s.measured[k];
    const checks = [
      { name: 'Sideways scrolling on phones is gone after the fix', pass: (m(fixed, 'LAY-01:mobile') ?? 0) > (m(base, 'LAY-01:mobile') ?? 0), detail: `overflow check ${fmt(m(base, 'LAY-01:mobile'))} to ${fmt(m(fixed, 'LAY-01:mobile'))} (of 4)` },
      { name: 'Small text is fixed', pass: (m(fixed, 'TYPE-01:mobile') ?? 0) > (m(base, 'TYPE-01:mobile') ?? 0), detail: `text-size check ${fmt(m(base, 'TYPE-01:mobile'))} to ${fmt(m(fixed, 'TYPE-01:mobile'))} (of 4)` },
      { name: 'Phone subtotal goes up', ...cmp(base.mobile?.subtotal ?? null, fixed.mobile?.subtotal ?? null, (a, b) => b > a, `${fmt(base.mobile?.subtotal)} to ${fmt(fixed.mobile?.subtotal)}`) },
    ];
    const up = checks[2].pass;
    return { checks, text: up === null ? 'The measured checks improved; the AI judge is off, so no subtotal.' : up ? `Fixing the site raised the phone score from ${fmt(base.mobile?.subtotal)} to ${fmt(fixed.mobile?.subtotal)}.` : `The site was fixed but the phone score did not go up (${fmt(base.mobile?.subtotal)} to ${fmt(fixed.mobile?.subtotal)}).` };
  },

  async 'mobile-only'(c, st) {
    const D = { label: 'Laptop view', sub: c.page, phone: false }, M = { label: 'Phone view', sub: 'same page, same run', phone: true };
    st.panels = [D, M]; st.focus = ['USABILITY'];
    D.note = M.note = 'Better is capturing and scoring this page...'; await show(st);
    const project = await createProject('mobile-only', pageUrl(c.page));
    const runs = [];
    let last;
    for (let i = 1; i <= repeat; i++) { last = await evaluate(project.id, {}, `mobile-only #${i}`); runs.push(summarize(last)); }
    D.img = await screenshotOf(last, 'desktop'); M.img = await screenshotOf(last, 'mobile'); D.note = M.note = null;
    D.score = averageScore(runs, 'desktop'); M.score = averageScore(runs, 'mobile');
    const lay = vp => mean(runs.map(r => r.measured[`LAY-01:${vp}`]));
    const checks = [
      { name: 'Sideways scrolling detected on the phone only', pass: lay('mobile') !== null && lay('desktop') !== null && lay('mobile') < lay('desktop'), detail: `overflow check laptop ${fmt(lay('desktop'))}, phone ${fmt(lay('mobile'))} (of 4)` },
      { name: 'Phone reflow deal-breaker flagged', pass: runs.every(r => r.mobile?.dealBreakers?.MOBILE_REFLOW === 'fail'), detail: runs.map(r => r.mobile?.dealBreakers?.MOBILE_REFLOW).join(', ') },
      { name: 'Phone gets the lower subtotal', ...cmp(avgSubtotal(runs, 'mobile'), avgSubtotal(runs, 'desktop'), (m, d) => m < d, `laptop ${fmt(avgSubtotal(runs, 'desktop'))}, phone ${fmt(avgSubtotal(runs, 'mobile'))}`) },
    ];
    const s = checks[2].pass;
    return { checks, text: s === null ? 'Measured checks caught the phone-only problem; the AI judge is off, so no subtotal.' : s ? 'Better caught that the page breaks on phones and scored the phone view lower.' : 'Measured checks caught the phone-only problem, but the AI judge did not score the phone view lower.' };
  },

  async stability(c, st) {
    const n = Math.max(c.minRepeats ?? 3, repeat);
    const project = await createProject('stability', pageUrl(c.page));
    st.panels = Array.from({ length: n }, (_, i) => ({ label: `Run ${i + 1}`, sub: 'same page, nothing changed', note: 'Waiting' }));
    const runs = [];
    for (let i = 0; i < n; i++) {
      st.panels[i].note = 'Scoring...'; st.status = `run ${i + 1} of ${n}`; await show(st);
      const run = await evaluate(project.id, {}, `stability #${i + 1}`);
      const s = summarize(run); runs.push(s);
      st.panels[i].img = await screenshotOf(run, 'desktop'); st.panels[i].score = averageScore([s], 'desktop'); st.panels[i].note = null;
      await show(st);
    }
    const checks = [];
    const spreads = {};
    for (const vp of ['desktop', 'mobile']) {
      const subs = runs.map(r => r[vp]?.subtotal).filter(x => typeof x === 'number');
      spreads[vp] = subs.length ? Math.max(...subs) - Math.min(...subs) : null;
      checks.push({ name: `${vp}: score varies by at most ${c.maxSpread} points`, ...(spreads[vp] === null ? { pass: null, detail: 'not scored in this judge mode' } : { pass: spreads[vp] <= c.maxSpread, detail: `scores ${subs.join(', ')}` }) });
    }
    checks.push({ name: 'No failed judge calls', pass: runs.every(r => r.judgeFailures === 0), detail: `failures per run: ${runs.map(r => r.judgeFailures).join(', ')}` });
    const ok = checks.filter(k => k.pass !== null).every(k => k.pass);
    return { checks, text: spreads.desktop === null ? 'Not scored in this judge mode.' : ok ? `The unchanged page scored the same every time (spread ${fmt(spreads.desktop)} on laptop, ${fmt(spreads.mobile)} on phone).` : `The unchanged page's score moved by itself (spread ${fmt(spreads.desktop)} on laptop, ${fmt(spreads.mobile)} on phone).` };
  },

  async honest(c, st) {
    const P = { label: c.url, sub: c.expectRejected ? 'private address' : 'domain that does not exist', note: 'Asking Better to scan this...' };
    st.panels = [P]; await show(st);
    const r = await api('/api/projects', { name: c.id, url: c.url, profile: profile(spec.brief) });
    if (!r.ok) {
      P.note = `Refused: ${r.json.error ?? r.status}`;
      return { checks: [{ name: 'Refused up front with a clear message', pass: true, detail: `HTTP ${r.status}: ${r.json.error ?? ''}` }], text: `Better refused it: "${r.json.error ?? r.status}".` };
    }
    if (c.expectRejected) { P.note = 'Accepted'; return { checks: [{ name: 'Refused up front', pass: false, detail: `accepted with HTTP ${r.status}` }], text: 'Better accepted a private address. Security hole.' }; }
    const s = summarize(await evaluate((r.json.project ?? r.json).id, {}, c.id));
    P.note = `Run ${s.status}: ${s.reason ?? ''}`;
    const checks = [
      { name: 'Run is marked failed', pass: s.status === 'failed', detail: s.reason ?? s.status },
      { name: 'No scores invented', pass: !s.desktop?.subtotal && !s.mobile?.subtotal, detail: `subtotals ${fmt(s.desktop?.subtotal)}, ${fmt(s.mobile?.subtotal)}` },
    ];
    return { checks, text: checks.every(k => k.pass) ? `Better said so instead of scoring: "${s.reason}".` : 'Better produced a score for a page it could not load.' };
  },

  async 'real-world'(c, st) {
    st.panels = c.sites.map(s => ({ label: s.name, sub: s.url }));
    const out = {};
    for (const [i, s] of c.sites.entries()) {
      try { out[s.name] = await scorePanel(st, st.panels[i], s.name, s.url, s.brief, s.name); }
      catch (e) { st.panels[i].note = String(e.message); out[s.name] = null; }
    }
    const checks = c.sites.map(s => ({ name: s.name, pass: null, detail: out[s.name] ? `laptop ${fmt(avgSubtotal(out[s.name], 'desktop'))}, phone ${fmt(avgSubtotal(out[s.name], 'mobile'))}` : 'failed' }));
    const [hi, lo] = c.expectOrder;
    const h = out[hi] ? avgSubtotal(out[hi], 'desktop') : null, l = out[lo] ? avgSubtotal(out[lo], 'desktop') : null;
    return { checks, info: true, text: h !== null && l !== null ? `${hi} ${fmt(h)} vs ${lo} ${fmt(l)} on laptop. ${h > l ? 'The polished site scored higher, as expected.' : 'The chaotic site scored as high or higher: worth a look.'}` : 'Recorded.' };
  },
};

// ---------- run ----------
log(`Suite "${suiteName}": ${cases.length} cases, repeat=${repeat}, judge=${opt.judge}`);
const report = [];
for (const [i, c] of cases.entries()) {
  const st = { n: i + 1, total: cases.length, group: c.group, question: c.question, why: c.why, expected: c.expected, panels: [], focus: [], status: 'running' };
  await show(st);
  const started = Date.now();
  log(`> ${c.id}: ${c.question}`);
  let out;
  try { out = await kinds[c.kind](c, st); }
  catch (e) { out = { checks: [{ name: 'Case ran to completion', pass: false, detail: String(e.message).slice(0, 400) }], text: `The test itself broke: ${String(e.message).slice(0, 200)}` }; }
  const scored = out.checks.filter(k => k.pass !== null);
  const status = out.info ? 'info' : !scored.length ? 'skip' : scored.every(k => k.pass) ? 'pass' : 'fail';
  st.status = `${((Date.now() - started) / 1000).toFixed(0)}s`; st.checks = out.checks; st.verdict = { status, text: out.text };
  await show(st);
  const file = await shot(c.id);
  for (const k of out.checks) log(`    ${k.pass === null ? 'SKIP' : k.pass ? 'MET ' : 'MISS'}  ${k.name}${k.detail ? `  (${k.detail})` : ''}`);
  log(`< ${c.id}: ${status.toUpperCase()}  ${out.text}`);
  report.push({ id: c.id, group: c.group, question: c.question, expected: c.expected, status, verdict: out.text, checks: out.checks, html: stageHtml(st), shot: file, seconds: Math.round((Date.now() - started) / 1000) });
  if (holdMs) await pause(holdMs);
}

// ---------- report ----------
const counts = { pass: 0, fail: 0, skip: 0, info: 0 };
for (const r of report) counts[r.status]++;
const meta = { startedAt: new Date(t0).toISOString(), suite: suiteName, judge: opt.judge, repeat, seconds: Math.round((Date.now() - t0) / 1000), counts };
await writeFile(join(outDir, 'results.json'), JSON.stringify({ meta, cases: report.map(({ html, ...r }) => r) }, null, 2));
const answer = s => ({ pass: 'YES', fail: 'NO', skip: "CAN'T TELL", info: 'RECORDED' }[s]);
const summaryHtml = `<section class="stage summary"><div class="top"><span>Better eval · judge ${esc(opt.judge)} · ${meta.seconds}s</span><span>${esc(meta.startedAt.slice(0, 16).replace('T', ' '))} UTC</span></div>
<h1>What this run tells you</h1><p class="why">${counts.pass} yes, ${counts.fail} no, ${counts.skip} can't tell${counts.info ? `, ${counts.info} recorded` : ''}. Each question is a promise Better makes to its users. Details for each follow below.</p>
${report.map(r => `<div class="q"><span class="a ${r.status}">${answer(r.status)}</span><span><b>${esc(r.question)}</b><br><span style="color:var(--muted)">${esc(r.verdict)}</span></span></div>`).join('')}</section>`;
await writeFile(join(outDir, 'report.html'), doc('Better eval report', summaryHtml + report.map(r => r.html).join('<hr style="border:0;border-top:1px solid var(--line);max-width:1380px;margin:0 auto">')));
log(`Report: ${join(outDir, 'report.html')}`);

if (!opt['no-log']) {
  const lines = [`\n### ${meta.startedAt.slice(0, 16).replace('T', ' ')} UTC: runner, ${suiteName}, judge \`${opt.judge}\`, repeat ${repeat}`, '',
    `${counts.pass} yes, ${counts.fail} no, ${counts.skip} can't tell, ${counts.info} recorded, ${meta.seconds}s.`, '',
    '| Test | Answer | Expected | What happened |', '|---|---|---|---|'];
  for (const r of report) lines.push(`| ${r.id} | ${answer(r.status)} | ${(r.expected ?? '').replace(/\|/g, '/')} | ${r.verdict.replace(/\|/g, '/')} ${r.checks.map(k => `${k.pass === null ? 'skipped' : k.pass ? 'met' : 'MISSED'}: ${k.name}${k.detail ? ` (${k.detail})` : ''}`).join('; ').replace(/\|/g, '/')} |`);
  await appendFile(join(here, 'TEST-LOG.md'), lines.join('\n') + '\n');
  log('Appended results to evals/TEST-LOG.md');
}

try { await (await livePage()).goto('file://' + join(outDir, 'report.html')); } catch {}
if (!opt.headless) await pause(Math.max(holdMs, 3000));
try { await browser.close(); } catch {}
cleanup();
await rm(dataDir, { recursive: true, force: true }).catch(() => {});
if (!opt.headless) spawn('open', [join(outDir, 'report.html')], { stdio: 'ignore', detached: true }).unref();
process.exit(counts.fail ? 1 : 0);
