import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.HARNESS_URL || 'http://127.0.0.1:3000';
async function post(path, body) {
  const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
  return result;
}
const project = await post('/api/projects', { name: 'Fieldwork demo', demo: true });
const baseline = await post(`/api/projects/${project.id}/runs`, { demoVersion: 'baseline' });
if (baseline.captures.some(c => c.status !== 'ready')) throw new Error('Demo capture failed; inspect the saved run.');
const fix = baseline.suggestions.find(s => s.criterionId === 'LAY-01' && s.viewport === 'mobile');
if (!fix) throw new Error('Controlled mobile overflow was not detected.');
const handoff = await post(`/api/runs/${baseline.id}/handoffs`, { selectedIds: [fix.id] });
const directory = process.env.BETTER_DATA_DIR || 'data';
await mkdir(directory, { recursive: true });
await writeFile(`${directory}/demo-prompt.md`, handoff.prompt);
const current = await post(`/api/projects/${project.id}/runs`, { demoVersion: 'revised' });
const comparison = await fetch(`${base}/api/runs/${current.id}/compare/${baseline.id}`).then(r => r.json());
console.log(JSON.stringify({ projectId: project.id, baselineRunId: baseline.id, currentRunId: current.id, prompt: `${directory}/demo-prompt.md`, comparison }, null, 2));
