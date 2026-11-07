import { combinedQuality } from './quality.ts';
import { type AxisScore, type Result, type Rubric, type Run, type Viewport } from '../domain.ts';

// Lower weighted median: retain ordinal anchors, avoid invented decimal precision.
// Each issue has one rubric home. Viewports and fixture/real evidence never mix.
export function aggregate(rubric: Rubric, results: Result[], viewport: Viewport, fixtures = false): AxisScore[] {
  if (rubric.combined) { const q = combinedQuality(rubric, results, viewport, [], fixtures); return q.criteria.map(c => ({ axis: c.id, score: c.points, assessed: c.points === null ? 0 : 1, total: 1, complete: c.points !== null, fixture: fixtures })); }
  return rubric.axes.map(({ id: axis }) => {
    const criteria = rubric.criteria.filter(c => c.channel === 'quality' && c.axis === axis && c.weight > 0 && (!fixtures || c.lane === 'visual'));
    const available = criteria.map(c => ({ criterion: c, result: results.find(r => r.criterionId === c.id && r.viewport === viewport) }));
    const applicable = available.filter(x => x.result?.status !== 'not_applicable');
    const scored = applicable.filter(x => x.result?.status === 'assessed' && x.result.score !== null && (fixtures ? x.result.provenance === 'fixture' : x.result.provenance !== 'fixture'));
    const complete = applicable.length > 0 && scored.length === applicable.length;
    let score: number | null = null;
    if (complete) {
      const sorted = scored.sort((a, b) => a.result!.score! - b.result!.score!);
      const half = sorted.reduce((sum, x) => sum + x.criterion.weight, 0) / 2;
      let weight = 0;
      for (const item of sorted) { weight += item.criterion.weight; if (weight >= half) { score = item.result!.score!; break; } }
    }
    return { axis, score, assessed: scored.length, total: applicable.length, complete, fixture: fixtures };
  });
}

export function compareRuns(baseline: Run, current: Run) {
  const reasons = Object.keys({ ...baseline.versions, ...current.versions }).filter(key => baseline.versions[key] !== current.versions[key]).map(key => `${key} changed`);
  if (baseline.projectId !== current.projectId) reasons.push('Different projects');
  const compatible = reasons.length === 0;
  return {
    baselineRunId: baseline.id, currentRunId: current.id, compatible, reasons,
    deltas: compatible ? current.results.map(result => {
      const previous = baseline.results.find(r => r.viewport === result.viewport && r.criterionId === result.criterionId);
      const delta = result.status === 'assessed' && previous?.status === 'assessed' && result.score !== null && previous.score !== null ? result.score - previous.score : null;
      return { criterionId: result.criterionId, viewport: result.viewport, provenance: result.provenance, delta, label: delta === null ? 'not_assessed' : result.provenance === 'fixture' ? 'illustrative_fixture_delta' : result.provenance === 'measured' ? 'measured_delta' : 'uncalibrated_judge_delta' };
    }) : [],
    // No cross-viewport overall score; mobile failures remain explicit.
    failures: current.results.filter(r => r.provenance !== 'fixture' && r.status === 'assessed' && r.score === (current.rubric.criteria.find(c => c.id === r.criterionId)?.role === 'points' ? 0 : 1)).map(r => ({ criterionId: r.criterionId, viewport: r.viewport, evidenceIds: r.evidenceIds })),
  };
}

// Headline numbers per viewport, derived on read so stored runs stay immutable.
// Fixture runs report their labeled sample summary; real runs never mix it in.
export function overall(run: Run) {
  const sample = run.mode === 'fixture' && !!run.fixtureQuality;
  const source = sample ? run.fixtureQuality : run.quality;
  if (!source) return null;
  // Runs stored before the cap removal keep their flattened cappedTotal/band on
  // disk; derive-on-read reports the authoritative raw total and fresh band.
  const bands = run.rubric.combined?.bands ?? [];
  const view = (viewport: 'desktop' | 'mobile') => {
    const q = source[viewport];
    const total = q.rawTotal ?? q.cappedTotal;
    const band = total === null ? null : bands.find(b => total >= b.min && total <= b.max)?.label ?? q.band;
    return { rawTotal: q.rawTotal, cappedTotal: total, band, assessedCriteria: q.coverage.assessedCriteria, capApplied: q.capApplied, layer3: q.layer3 ? { status: q.layer3.status, cappedTotal: q.layer3.layer3Total ?? q.layer3.cappedTotal, provisional: q.layer3.provisional } : null };
  };
  return { sample, desktop: view('desktop'), mobile: view('mobile') };
}
export const runSummary = (run: Run) => ({ id: run.id, createdAt: run.createdAt, status: run.status, mode: run.mode, buildLabel: run.buildLabel, overall: overall(run) });
