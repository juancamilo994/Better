import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRubric } from '../src/config.ts';
import type { QualitySummary } from '../src/domain.ts';
import { adaptDetectorResult, loadDetectorRegistry, nativeDetector, scoreLayer3, type DetectorRun } from '../src/evaluation/layer3.ts';
import { capture } from './helpers.ts';

const rubric = loadRubric();
const registry = loadDetectorRegistry(rubric);
const allRules = registry.rules.map(r => r.id);
function quality(points: Record<string, number | null> = {}, capApplied = false): QualitySummary {
  const criteria = rubric.axes.map(a => ({ id: a.id, title: a.title, max: a.weight!, points: a.id in points ? points[a.id] : a.weight!, evidenceIds: ['e'], reason: 'test' }));
  return { policyVersion: 'test', policyStatus: 'proposed', criteria, coverage: { assessedCriteria: 10, totalCriteria: 10, assessedWeight: 100 }, observedSubtotal: 100, rawTotal: 100, dealBreakers: [], capApplied, cap: 49, cappedTotal: 100, band: null, unresolved: [] };
}
const fixture = (ids: string[], rulesRun: string[] = allRules): DetectorRun => adaptDetectorResult(registry, { tool: 'impeccable', version: 't', url: 'https://better-demo.invalid/', attested: true, rulesRun, findings: ids.map(id => ({ id })) }, 'https://better-demo.invalid/', 'desktop', 'fixture');
const score = (runs: DetectorRun[], q = quality(), adjudications: Parameters<typeof scoreLayer3>[4] = []) => scoreLayer3(rubric, registry, q, runs, adjudications, [], []);
const row = (s: ReturnType<typeof score>, id: string) => s.criteria.find(c => c.id === id)!;

test('registry holds all 62 rules with six gates and preserves multi-criterion mappings', () => {
  assert.equal(registry.rules.length, 62); assert.equal(registry.rules.filter(r => r.gate).length, 6);
  assert.deepEqual(registry.rules.find(r => r.id === 'overused-font')!.criteria, ['TYPOGRAPHY', 'ORIGINALITY']);
  assert.deepEqual(registry.rules.find(r => r.id === 'nested-cards')!.criteria, ['DENSITY', 'SYSTEM']);
});

test('a flag deducts 2 from each mapped criterion and repeats count once per criterion', () => {
  const s = score([fixture(['nested-cards', 'nested-cards', 'nested-cards'])]);
  assert.deepEqual(s.deductions.map(d => [d.criterion, d.points, d.occurrences, d.status]), [['DENSITY', 2, 3, 'applied'], ['SYSTEM', 2, 3, 'applied']]);
  assert.equal(row(s, 'DENSITY').final, 10); assert.equal(row(s, 'SYSTEM').final, 6);
  assert.equal(s.status, 'complete'); assert.equal(s.layer3Total, 96);
});

test('an advisory deducts 1 only after adjudication as non-deliberate', () => {
  const pending = score([fixture(['straggler'])]);
  assert.equal(pending.deductions[0].status, 'pending_adjudication'); assert.equal(pending.provisional, true); assert.equal(pending.layer3Total, 100);
  const accidental = score([fixture(['straggler'])], quality(), [{ ruleId: 'straggler', criterion: 'TYPOGRAPHY', deliberate: false, note: 'Reviewed: accidental.' }]);
  assert.equal(accidental.deductions[0].points, 1); assert.equal(row(accidental, 'TYPOGRAPHY').final, 5); assert.equal(accidental.provisional, false);
  const deliberate = score([fixture(['straggler'])], quality(), [{ ruleId: 'straggler', criterion: 'TYPOGRAPHY', deliberate: true, note: 'Intentional.' }]);
  assert.equal(deliberate.deductions[0].status, 'deliberate'); assert.equal(row(deliberate, 'TYPOGRAPHY').final, 6);
});

test('three AI-tell flags cap Originality at 5; order ambiguity and missing floors stay unknown', () => {
  // Three AI tells mapped outside Originality: the cap applies with no Originality deduction, so both orders agree.
  const capOnly = score([fixture(['nested-cards', 'monotonous-spacing', 'oversized-hero-headline'])]);
  assert.equal(capOnly.aiTellFlags, 3); assert.equal(capOnly.originalityCapApplied, true);
  assert.equal(row(capOnly, 'ORIGINALITY').final, 5); assert.equal(row(capOnly, 'ORIGINALITY').originalityCap, 5);
  // Raw 10, cap 5, three 2-point Originality deductions: deduct-then-cap 4, cap-then-deduct -1. Unknown, not chosen.
  const order = score([fixture(['gradient-text', 'side-tab-accent-border', 'radial-spotlight-glow'])]);
  assert.equal(row(order, 'ORIGINALITY').final, null); assert.match(row(order, 'ORIGINALITY').reason, /Unresolved order: deduct-then-cap gives 4, cap-then-deduct gives -1/);
  // Two flags exceeding raw points: no invented zero floor.
  const floor = score([fixture(['gradient-text', 'side-tab-accent-border'])], quality({ ORIGINALITY: 2 }));
  assert.equal(row(floor, 'ORIGINALITY').final, null); assert.match(row(floor, 'ORIGINALITY').reason, /Unresolved floor/);
  assert.equal(floor.layer3Total, null);
  // Fewer than three AI tells: no cap.
  assert.equal(score([fixture(['gradient-text', 'nested-cards'])]).originalityCapApplied, false);
});

test('a verified gate failure flags the run without reducing the total; an unattested one does not', () => {
  const gate = score([fixture(['broken-image'])]);
  assert.equal(gate.gates.find(g => g.ruleId === 'broken-image')!.verdict, 'fail'); assert.equal(gate.capApplied, true); assert.equal(gate.cappedTotal, 100);
  assert.equal(gate.review.topFixes[0].priority, 'P0');
  const external = adaptDetectorResult(registry, { tool: 'impeccable', version: '3', url: 'https://example.com/', attested: false, rulesRun: 'all-mapped', findings: [{ antipattern: 'broken-image' }, { antipattern: 'not-a-rule' }] }, 'https://example.com/', 'desktop');
  const unattested = score([external]);
  assert.equal(unattested.capApplied, false); assert.deepEqual(unattested.runs[0].unmapped, ['not-a-rule']);
  assert.ok(unattested.unresolved.some(u => /unattested/.test(u)));
  assert.throws(() => adaptDetectorResult(registry, { tool: 'impeccable', version: '3', url: 'https://other.example/', attested: true, rulesRun: [], findings: [] }, 'https://example.com/', 'desktop'), /does not match/);
});

test('an unrun or partial detector is never a clean pass', () => {
  const unrun = score([]);
  assert.equal(unrun.status, 'unrun'); assert.equal(unrun.layer3Total, null); assert.equal(unrun.cappedTotal, null);
  assert.ok(unrun.gates.every(g => g.verdict === 'unknown'));
  const partial = score([nativeDetector({ ...capture(), facts: { ...capture().facts, brokenImages: 0, headingLevels: [1, 2], controls: [] }, pageErrors: 0 })]);
  assert.equal(partial.status, 'partial'); assert.equal(partial.layer3Total, null);
  assert.equal(partial.gates.find(g => g.ruleId === 'broken-image')!.verdict, 'pass');
  assert.equal(partial.gates.find(g => g.ruleId === 'text-occluded')!.verdict, 'unknown');
});

test('configured exceptions need adjudication; unknown exceptions are rejected', () => {
  const allowed = score([fixture(['overused-font'])], quality(), [{ ruleId: 'overused-font', criterion: 'TYPOGRAPHY', deliberate: true, exceptionId: 'common-face-with-distinctive-move', note: 'Inter plus a distinctive color system.' }]);
  assert.deepEqual(allowed.deductions.map(d => [d.criterion, d.status]), [['TYPOGRAPHY', 'exception'], ['ORIGINALITY', 'applied']]);
  assert.throws(() => score([fixture(['overused-font'])], quality(), [{ ruleId: 'overused-font', criterion: 'TYPOGRAPHY', deliberate: true, exceptionId: 'made-up', note: 'x' }]), /not configured/);
});

test('native detector requires clean loads before counting script errors and reads heading skips', () => {
  const base = { ...capture(), facts: { ...capture().facts, brokenImages: 1, headingLevels: [1, 3], controls: [] } };
  const clean = nativeDetector({ ...base, pageErrors: 2, blockedRequests: 0, failedResources: 0 });
  assert.deepEqual(clean.occurrences.map(o => o.ruleId).sort(), ['broken-image', 'script-error-on-load', 'skipped-heading-level']);
  const blocked = nativeDetector({ ...base, pageErrors: 2, blockedRequests: 3 });
  assert.equal(blocked.coveredRuleIds.includes('script-error-on-load'), false);
});
