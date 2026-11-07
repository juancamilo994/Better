import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.ts';
import { hash } from '../src/config.ts';
import { deterministic } from '../src/evaluation/checks.ts';
import { explain } from '../src/evaluation/explanations.ts';
import { run, capture, profile } from './helpers.ts';

test('restart preserves immutable runs, selection snapshots, prompts and corrections', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'better-store-'));
  let store = new Store(directory);
  try {
    store.createProject({ id: 'project', name: 'Test', url: 'https://example.com', source: 'public_url', createdAt: 'now', profile });
    const r = run(); r.results = [deterministic(r.rubric.criteria.find(c => c.id === 'TYPE-01')!, capture())]; r.suggestions = explain(r.id, r.rubric, r.results);
    store.saveRun(r);
    const handoff = store.handoff(r.id, [r.suggestions[0].id]);
    store.correct(r.id, 'TYPE-01', 'desktop', 'Review this threshold.');
    assert.throws(() => store.saveRun({ ...r, buildLabel: 'overwrite' }));
    store.close(); store = new Store(directory);
    assert.deepEqual(store.run(r.id), r); assert.equal(store.handoffs(r.id)[0].prompt, handoff.prompt);
    assert.equal(store.corrections(r.id)[0].note, 'Review this threshold.');
    const db = new DatabaseSync(join(directory, 'better.sqlite'));
    assert.throws(() => db.prepare('UPDATE runs SET data=? WHERE id=?').run('{}', r.id), /Append-only/);
    assert.throws(() => db.prepare('DELETE FROM runs WHERE id=?').run(r.id), /Append-only/);
    db.close();
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
test('artifact downloads fail closed when bytes no longer match immutable manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'better-evidence-')); const store = new Store(directory);
  try {
    store.createProject({ id: 'project', name: 'Test', url: 'https://example.com', source: 'public_url', createdAt: 'now', profile });
    const r = run(); const a = r.captures[0].artifacts[0]; a.sha256 = hash('original');
    await mkdir(join(directory, 'evidence', r.id), { recursive: true }); await writeFile(join(directory, 'evidence', r.id, a.file), 'original'); store.saveRun(r);
    assert.equal((await store.evidence(r.id, a.id)).bytes.toString(), 'original');
    await writeFile(join(directory, 'evidence', r.id, a.file), 'tampered');
    await assert.rejects(store.evidence(r.id, a.id), /integrity/);
  } finally { store.close(); await rm(directory, { recursive: true, force: true }); }
});
