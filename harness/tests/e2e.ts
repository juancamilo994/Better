import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { hash } from '../src/config.ts';
import type { Run, Handoff, Project } from '../src/domain.ts';

const data = await mkdtemp(join(tmpdir(), 'better-e2e-'));
const artifacts = resolve('test-results');
await mkdir(artifacts, { recursive: true });
let server: ChildProcess;
let base = '';
async function start(mode = 'fixture') {
  server = spawn(process.execPath, ['dist/server.js'], { env: { ...process.env, PORT: '0', BETTER_DATA_DIR: data, BETTER_JUDGE: mode, BETTER_ALLOW_PAID_CALLS: 'false', SUBQ_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  base = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out.')), 10_000);
    server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}`)); });
    server.stdout!.on('data', chunk => {
      const line = String(chunk).trim();
      if (line.startsWith('Better harness listening on ')) { clearTimeout(timeout); resolve(line.slice('Better harness listening on '.length)); }
    });
  });
}
async function stop() { const done = once(server, 'exit'); server.kill('SIGTERM'); await done; }
async function json<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.ok(response.ok, `${path}: HTTP ${response.status} ${await response.clone().text()}`);
  return response.json() as Promise<T>;
}
function result(run: Run, id: string, viewport = 'mobile') { return run.results.find(r => r.criterionId === id && r.viewport === viewport)!; }

try {
  await start();
  const project = await json<Project>('/api/projects', { name: 'Controlled E2E', demo: true });
  const baseline = await json<Run>(`/api/projects/${project.id}/runs`, { demoVersion: 'baseline', expectedText: 'Fieldwork' });
  assert.equal(baseline.status, 'partial');
  assert.deepEqual(baseline.captures.map(c => c.status), ['ready', 'ready']);
  assert.equal(result(baseline, 'LAY-01').score, 1);
  assert.equal(result(baseline, 'LAY-01', 'desktop').score, 4);
  assert.equal(result(baseline, 'TYPE-01').score, 1);
  assert.equal(result(baseline, 'TYPE-02').provenance, 'fixture');
  assert.equal(result(baseline, 'INT-02').score, null);
  assert.equal(result(baseline, 'MOT-01').score, null);
  assert.equal(result(baseline, 'ADAPT-01').evidenceIds.length, 2);
  for (const capture of baseline.captures) {
    assert.equal(capture.artifacts.length, 5);
    for (const artifact of capture.artifacts) {
      const response: Response = await fetch(`${base}/api/runs/${baseline.id}/evidence/${encodeURIComponent(artifact.id)}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-disposition')!, /attachment/);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(hash(bytes), artifact.sha256);
      if (artifact.kind === 'screenshot') {
        assert.equal(bytes.readUInt32BE(16), capture.width); assert.equal(bytes.readUInt32BE(20), capture.height);
        await writeFile(join(artifacts, `baseline-${capture.viewport}.png`), bytes);
      }
      if (artifact.kind === 'dom') { assert.match(response.headers.get('content-type')!, /text\/plain/); assert.match(bytes.toString(), /Fieldwork/); }
    }
  }
  const selected = baseline.suggestions.find(s => s.criterionId === 'LAY-01' && s.viewport === 'mobile')!;
  const handoff = await json<Handoff>(`/api/runs/${baseline.id}/handoffs`, { selectedIds: [selected.id] });
  assert.equal(handoff.selectedIds.length, 1); assert.equal(handoff.deferredIds.length, baseline.suggestions.length - 1);
  assert.match(handoff.prompt, /Remove horizontal overflow/); assert.doesNotMatch(handoff.prompt, /Increase small text/);
  await writeFile(join(artifacts, 'selected-prompt.md'), handoff.prompt);
  await json(`/api/runs/${baseline.id}/corrections`, { criterionId: 'TYPE-02', viewport: 'mobile', note: 'Human review: retain the workshop instructions.' });
  const current = await json<Run>(`/api/projects/${project.id}/runs`, { demoVersion: 'revised' });
  assert.equal(current.projectId, baseline.projectId); assert.equal(current.parentRunId, baseline.id);
  assert.equal(result(current, 'LAY-01').score, 4); assert.equal(result(current, 'TYPE-01').score, 4);
  assert.notEqual(current.manifest.capturedBuildHash, baseline.manifest.capturedBuildHash);
  const comparison = await json<{ compatible: boolean; deltas: { criterionId: string; viewport: string; delta: number | null; label: string }[] }>(`/api/runs/${current.id}/compare/${baseline.id}`);
  assert.equal(comparison.compatible, true);
  assert.equal(comparison.deltas.find(d => d.criterionId === 'LAY-01' && d.viewport === 'mobile')!.delta, 3);
  assert.equal(comparison.deltas.find(d => d.criterionId === 'FIT-01')!.delta, 0);
  assert.equal(comparison.deltas.find(d => d.criterionId === 'CRAFT-01')!.delta, -1);
  assert.equal(comparison.deltas.find(d => d.criterionId === 'CRAFT-01')!.label, 'illustrative_fixture_delta');
  for (const c of current.captures) {
    const a = c.artifacts.find(a => a.kind === 'screenshot')!;
    await writeFile(join(artifacts, `revised-${c.viewport}.png`), await readFile(join(data, 'evidence', current.id, a.file)));
  }
  const changed = await json<Run>(`/api/projects/${project.id}/runs`, { profile: { ...current.profile, taste: 'Editorial', version: current.profile.version } });
  const incompatible = await json<{ compatible: boolean; deltas: unknown[] }>(`/api/runs/${changed.id}/compare/${current.id}`);
  assert.equal(incompatible.compatible, false); assert.deepEqual(incompatible.deltas, []);
  const failed = await json<Run>(`/api/projects/${project.id}/runs`, { expectedText: 'THIS MARKER DOES NOT EXIST' });
  assert.equal(failed.status, 'failed'); assert.ok(failed.results.every(r => r.score === null));
  const crossOrigin = await fetch(`${base}/api/projects`, { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(crossOrigin.status, 403);
  const privateUrl = await fetch(`${base}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Blocked', url: 'http://127.0.0.1/' }) });
  assert.equal(privateUrl.status, 400);
  await stop(); await start('subq');
  const restored = await json<{ run: Run; handoffs: Handoff[]; corrections: unknown[] }>(`/api/runs/${baseline.id}`);
  assert.deepEqual(restored.run, baseline); assert.equal(restored.handoffs[0].prompt, handoff.prompt); assert.equal(restored.corrections.length, 1);
  const needsSetupProject = await json<Project>('/api/projects', { name: 'Setup boundary', demo: true });
  const needsSetup = await json<Run>(`/api/projects/${needsSetupProject.id}/runs`, {});
  assert.equal(needsSetup.status, 'setup_needed'); assert.equal(result(needsSetup, 'HIER-01').score, null); assert.equal(result(needsSetup, 'LAY-01').provenance, 'measured');
  await writeFile(join(artifacts, 'summary.json'), JSON.stringify({ passed: true, dataDirectory: data, baseline: baseline.id, current: current.id, captures: 10, screenshots: ['baseline-desktop.png','baseline-mobile.png','revised-desktop.png','revised-mobile.png'], comparison, restartPreservedHistory: true, setupNeededVerified: true, noPaidSubQCalls: 'SUBQ_API_KEY empty; BETTER_ALLOW_PAID_CALLS=false in child process' }, null, 2));
  // Useful actual API output for teammate integration; explicit fixture provenance.
  await writeFile(join(artifacts, 'baseline-run.json'), JSON.stringify(baseline, null, 2));
  console.log('PASS: built HTTP API → real Chromium desktop/mobile → evidence → selected-only prompt → revised capture → compatible/flat/regressed/unassessed deltas → changed-profile rejection → restart history → setup-needed.');
  console.log(`Evidence: ${artifacts}; isolated state: ${data}`);
} finally { if (server! && server.exitCode === null) await stop(); }
