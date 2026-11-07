import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRubric } from '../src/config.ts';
import type { Capture, Measurements } from '../src/domain.ts';
import { deterministic, missingEvidence } from '../src/evaluation/checks.ts';
import { dealBreakerObservations } from '../src/evaluation/dealbreakers.ts';
import { combinedQuality } from '../src/evaluation/quality.ts';
import { capture, profile } from './helpers.ts';

const rubric = loadRubric();
const criterion = (id: string) => rubric.criteria.find(c => c.id === id)!;
function measured(viewport: 'desktop' | 'mobile', m: Partial<Measurements>): Capture {
  const c = capture(viewport);
  const measurements: Measurements = { engine: 'axe-core test', contrast: [], targetSize: [], spacing: {}, reflow320: null, ...m };
  return { ...c, measurements, artifacts: [...c.artifacts, { id: `run:${viewport}:measurements`, runId: 'run', viewport, state: 'default-frozen', kind: 'measurements', file: `${viewport}.measurements.json`, sha256: 'hash', bytes: 10 }] };
}
const find = (observations: ReturnType<typeof dealBreakerObservations>, id: string) => observations.find(o => o.id === id);

test('one measured contrast failure is a verified deal-breaker failure that flags the run', () => {
  const c = measured('desktop', { contrast: [{ outcome: 'pass', target: 'p', expected: 4.5 }, { outcome: 'fail', target: '.muted', ratio: 2.8, expected: 4.5 }] });
  const observations = dealBreakerObservations([c], 'desktop');
  assert.deepEqual({ ...find(observations, 'BODY_CONTRAST') }, { id: 'BODY_CONTRAST', applicable: true, verdict: 'fail', verified: true, evidenceIds: ['run:desktop:measurements'], evidenceKind: 'measurement' });
  assert.equal(find(observations, 'LARGE_TEXT_CONTRAST')?.applicable, false);
  assert.equal(combinedQuality(rubric, [], 'desktop', observations).dealBreakers.find(o => o.id === 'BODY_CONTRAST')?.verdict, 'fail');
});

test('unmeasured nodes keep a contrast pass unknown, and a missing engine observes nothing', () => {
  const partial = dealBreakerObservations([measured('desktop', { contrast: [{ outcome: 'pass', target: 'p', expected: 4.5 }, { outcome: 'unknown', target: '.hero' }] })], 'desktop');
  assert.equal(find(partial, 'BODY_CONTRAST')?.verdict, 'unknown');
  assert.equal(find(partial, 'BODY_CONTRAST')?.verified, false);
  assert.deepEqual(dealBreakerObservations([measured('desktop', { engine: null })], 'desktop'), []);
});

test('320 px reflow comes from the mobile capture and applies to both viewport totals', () => {
  const captures = [measured('desktop', {}), measured('mobile', { reflow320: { scrollWidth: 410, clientWidth: 320 } })];
  for (const viewport of ['desktop', 'mobile'] as const) {
    const reflow = find(dealBreakerObservations(captures, viewport), 'MOBILE_REFLOW')!;
    assert.equal(reflow.verdict, 'fail'); assert.equal(reflow.evidenceKind, 'matched_mobile_320'); assert.deepEqual(reflow.evidenceIds, ['run:mobile:measurements']);
  }
});

test('type-scale check counts distinct text sizes against the configured warning level', () => {
  const c = capture();
  const sizes = [12, 14, 16, 18, 24, 32];
  c.facts.elements = sizes.map((fontSize, i) => ({ ...c.facts.elements[0], id: `element-${i}`, fontSize }));
  const many = deterministic(criterion('TYPE-02-SCALE'), c);
  assert.equal(many.score, 1); assert.equal(many.findingId, 'TOO_MANY_TYPE_SIZES');
  c.facts.elements = c.facts.elements.slice(0, 5);
  assert.equal(deterministic(criterion('TYPE-02-SCALE'), c).score, 4);
});

test('spacing-scale check needs measurements and reports the on-scale share', () => {
  assert.match(missingEvidence(criterion('SYSTEM-01-SPACING'), capture(), capture('mobile'), profile)!, /measurements/);
  const off = deterministic(criterion('SYSTEM-01-SPACING'), measured('desktop', { spacing: { '8': 2, '13': 6, '16': 2 } }));
  assert.equal(off.score, 1); assert.equal(off.findingId, 'OFF_SCALE_SPACING'); assert.match(off.reason, /40% of 10/); assert.ok(off.evidenceIds.includes('run:desktop:measurements'));
  assert.equal(deterministic(criterion('SYSTEM-01-SPACING'), measured('desktop', { spacing: { '8': 8, '13': 2 } })).score, 4);
});
