import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRubric } from '../src/config.ts';
import { rubricSchema } from '../src/domain.ts';
import { aggregate, compareRuns } from '../src/evaluation/aggregation.ts';
import { deterministic, missingEvidence, unassessed } from '../src/evaluation/checks.ts';
import { assemblePrompt, explain } from '../src/evaluation/explanations.ts';
import { FixtureJudge } from '../src/judges/fixture.ts';
import { capture, input, profile, run } from './helpers.ts';

const rubric = loadRubric();
const criterion = (id: string) => rubric.criteria.find(c => c.id === id)!;

test('typography and message clarity are separately scored; interactions and trust boundaries are explicit', () => {
  assert.equal(criterion('TYPE-01').lane, 'deterministic'); assert.equal(criterion('TYPE-02').lane, 'visual');
  assert.match(criterion('TYPE-02').instructions, /Preserve essential labels, errors, instructions/);
  assert.equal(criterion('INT-01').lane, 'visual'); assert.equal(criterion('INT-02').lane, 'unsupported');
  assert.match(criterion('INT-01').instructions, /Never infer that clicking works/);
  assert.match(criterion('FIT-01').instructions, /Do not judge actual company trustworthiness/);
  assert.equal(criterion('MOT-01').lane, 'unsupported');
  assert.match(missingEvidence(criterion('MOT-01'), capture(), capture('mobile'), profile)!, /Static inputs/);
});
test('adaptation requires every matching condition, not simply two screenshots', () => {
  const c = criterion('ADAPT-01'); const desktop = capture(); const mobile = capture('mobile');
  assert.equal(missingEvidence(c, desktop, mobile, profile), null);
  for (const change of [undefined, { ...mobile, status: 'failed' as const }, { ...mobile, viewport: 'desktop' as const }, { ...mobile, url: 'https://different.example/' }, { ...mobile, documentHash: 'different' }, { ...mobile, artifacts: mobile.artifacts.map(a => ({ ...a, runId: 'other-run' })) }]) {
    assert.match(missingEvidence(c, desktop, change, profile)!, /matched desktop\/mobile/);
  }
  const missingShot = { ...desktop, artifacts: desktop.artifacts.filter(a => a.kind !== 'screenshot') };
  assert.match(missingEvidence(c, missingShot, mobile, profile)!, /missing screenshot/);
});
test('deterministic facts do not certify broad quality or invent scores without evidence', () => {
  const c = capture('mobile'); c.facts.scrollWidth = 1100; c.facts.clientWidth = 390;
  const overflow = deterministic(criterion('LAY-01'), c);
  assert.equal(overflow.score, 1); assert.equal(overflow.provenance, 'measured');
  assert.equal(deterministic(criterion('TYPE-01'), c).score, 1);
  assert.equal(deterministic(criterion('ACC-01'), c).status, 'not_applicable');
  c.facts.truncated = true;
  assert.equal(deterministic(criterion('TYPE-01'), c).score, null);
  const missing = { ...c, status: 'failed' as const };
  assert.ok(missingEvidence(criterion('LAY-01'), missing, capture(), profile));
});
test('single-home findings are enforced structurally in configurable rubric', () => {
  const bad = structuredClone(rubric);
  bad.criteria[1].findings = structuredClone(bad.criteria[0].findings);
  assert.equal(rubricSchema.safeParse(bad).success, false);
});
test('aggregation preserves missing axes, mobile failure and fixture separation', async () => {
  const desktop = capture(); const mobile = capture('mobile'); mobile.facts.scrollWidth = 1100; mobile.facts.clientWidth = 390;
  const results = [deterministic(criterion('LAY-01'), desktop), deterministic(criterion('LAY-01'), mobile), await new FixtureJudge().evaluate(input())];
  assert.equal(aggregate(rubric, results, 'desktop').find(a => a.axis === 'LAY')!.score, 4);
  assert.equal(aggregate(rubric, results, 'mobile').find(a => a.axis === 'LAY')!.score, 1);
  assert.equal(aggregate(rubric, results, 'desktop').find(a => a.axis === 'HIER')!.score, null);
  assert.equal(aggregate(rubric, results, 'desktop', true).find(a => a.axis === 'HIER')!.score, 2);
  assert.equal(aggregate(rubric, results, 'desktop').find(a => a.axis === 'INT')!.complete, false);
});
test('ordinal aggregation uses weights and leaves partially assessed axis incomplete', () => {
  const a = { ...unassessed(criterion('TYPE-01'), capture(), ''), status: 'assessed' as const, provenance: 'measured' as const, score: 1 };
  const b = { ...unassessed(criterion('TYPE-02'), capture(), ''), status: 'assessed' as const, provenance: 'subq' as const, score: 4 };
  assert.equal(aggregate(rubric, [a], 'desktop').find(a => a.axis === 'TYPE')!.score, null);
  assert.equal(aggregate(rubric, [a,b], 'desktop').find(a => a.axis === 'TYPE')!.score, 1);
  const weighted = structuredClone(rubric); weighted.criteria.find(c => c.id === 'TYPE-02')!.weight = 3;
  assert.equal(aggregate(weighted, [a,b], 'desktop').find(a => a.axis === 'TYPE')!.score, 4);
});
test('only compatible runs get deltas; original data stays unchanged', () => {
  const baseline = run(); const current = run(); current.id = 'second';
  baseline.results = [deterministic(criterion('TYPE-01'), capture())];
  current.results = [{ ...baseline.results[0], score: 4 }];
  const comparison = compareRuns(baseline, current);
  assert.equal(comparison.compatible, true); assert.equal(comparison.deltas[0].delta, 3);
  for (const key of ['rubric','profile','capture','judge']) {
    const changed = structuredClone(current); changed.versions[key] = 'changed';
    assert.equal(compareRuns(baseline, changed).compatible, false); assert.deepEqual(compareRuns(baseline, changed).deltas, []);
  }
  current.results[0].status = 'not_assessed'; current.results[0].score = null;
  assert.equal(compareRuns(baseline, current).deltas[0].delta, null); assert.equal(baseline.results[0].score, 1);
});
test('selected-only prompt consolidates duplicates, rejects dependencies/conflicts and preserves essential microcopy', () => {
  const r = run(); const mobile = capture('mobile'); mobile.facts.scrollWidth = 1100; mobile.facts.clientWidth = 390;
  r.results = [deterministic(criterion('LAY-01'), mobile), deterministic(criterion('TYPE-01'), mobile), deterministic(criterion('TYPE-01'), capture())];
  r.suggestions = explain(r.id, rubric, r.results);
  const selected = r.suggestions.find(s => s.criterionId === 'LAY-01')!;
  const prompt = assemblePrompt(r, [selected.id]);
  assert.match(prompt, /Remove horizontal overflow/); assert.doesNotMatch(prompt, /Increase small text/);
  assert.match(prompt, /essential labels, errors, instructions/); assert.match(prompt, /NOT CONNECTED/);
  const type = r.suggestions.filter(s => s.criterionId === 'TYPE-01');
  assert.equal(assemblePrompt(r, type.map(s => s.id)).split('Change:').length, 2);
  assert.throws(() => assemblePrompt(r, [])); assert.throws(() => assemblePrompt(r, ['other-run']));
  assert.throws(() => assemblePrompt(r, [selected.id, selected.id]));
  selected.dependencies = ['SMALL_TEXT']; assert.throws(() => assemblePrompt(r, [selected.id]), /dependencies/);
  selected.dependencies = []; selected.conflicts = ['SMALL_TEXT'];
  assert.throws(() => assemblePrompt(r, [selected.id, type[0].id]), /conflicting/);
});
