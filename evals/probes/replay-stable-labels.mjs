import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const dir = process.argv[2]; const h = s => createHash('sha256').update(s).digest('hex').slice(0, 12);
const fs = readdirSync(`${dir}/log`).filter(f => f.endsWith('-req.json')).sort();
const want = { c2debdb1d608: 'INTERACTION', f5d8fea62ed2: 'USABILITY' };
for (const f of fs) {
  const b = JSON.parse(readFileSync(`${dir}/log/${f}`));
  const name = want[h(b.questions.rating.instructions)];
  if (!name || b.state.viewport !== 'desktop') continue;
  // Fix: stable, run-independent evidence labels.
  b.state.evidence = Object.fromEntries(Object.values(b.state.evidence).map((v, i) => [`image_${i + 1}`, v]));
  const r = await (await fetch('https://api.subq.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUBQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).json();
  const p = r.answers.rating.probabilities;
  console.log(name.padEnd(12), f.slice(0, 4), 'choice', r.answers.rating.choice, JSON.stringify(Object.fromEntries(Object.entries(p).map(([k, v]) => [k, +v.toFixed(3)]))));
}
