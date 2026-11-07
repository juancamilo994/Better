// Replays logged SubQ requests with optional prompt variants; prints rating probabilities.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const [dir, key] = [process.argv[2], process.env.SUBQ_API_KEY];
const h = s => createHash('sha256').update(s).digest('hex').slice(0, 12);
const files = readdirSync(`${dir}/log`).filter(f => f.endsWith('-req.json')).sort().slice(0, 26);
const pick = { INTERACTION: 'c2debdb1d608', USABILITY: 'f5d8fea62ed2', TYPOGRAPHY: '6969fd772dbe' };
const base = {};
for (const f of files) { const b = JSON.parse(readFileSync(`${dir}/log/${f}`)); if (b.state.viewport !== 'desktop') continue; const k = Object.entries(pick).find(([, v]) => v === h(b.questions.rating.instructions)); if (k) base[k[0]] = b; }
const boundaryEnd = 'original repository source.';
const variants = {
  V0_identical: b => b,
  V1_no_even_when_uncertain: b => { b.questions.rating.instructions = b.questions.rating.instructions.replace(' Choose the anchor closest to what the screenshot shows, even when uncertain; confidence is recorded separately.', ' Choose the anchor that best matches.'); return b; },
  V2_no_boundary_preamble: b => { const i = b.questions.rating.instructions; b.questions.rating.instructions = i.slice(i.indexOf(boundaryEnd) + boundaryEnd.length).trim(); return b; },
  V3_screenshot_only: b => { b.state.untrusted_page_evidence = { text: '', elements: [] }; return b; },
  V4_reversed_option_order: b => { b.questions.rating.criteria = Object.fromEntries(Object.entries(b.questions.rating.criteria).reverse()); return b; },
};
const reps = { V0_identical: 5 };
const out = [];
for (const [crit, body] of Object.entries(base)) for (const [vn, fn] of Object.entries(variants)) for (let i = 0; i < (reps[vn] ?? 3); i++) {
  const b = fn(structuredClone(body));
  const res = await fetch('https://api.subq.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const j = await res.json().catch(() => ({}));
  const r = j.answers?.rating;
  out.push({ crit, variant: vn, i, status: res.status, choice: r?.choice, probs: r?.probabilities });
  console.log(crit.padEnd(12), vn.padEnd(26), i, res.status, r ? `choice ${r.choice}  ${JSON.stringify(Object.fromEntries(Object.entries(r.probabilities).map(([k, v]) => [k, +v.toFixed(2)])))}` : JSON.stringify(j).slice(0, 120));
}
writeFileSync(`${dir}/replay.json`, JSON.stringify(out, null, 2));
