import { AppError, type DealBreakerObservation, type QualitySummary, type Result, type Rubric, type Viewport } from '../domain.ts';

// Points are supplied directly by configured anchors. No missing-evidence
// normalization, ordinal conversion, extra issue deductions or chart-area score.
export function combinedQuality(rubric: Rubric, results: Result[], viewport: Viewport, observations: DealBreakerObservation[] = [], fixtures = false): QualitySummary {
  const policy = rubric.combined;
  if (!policy) throw new AppError('Combined scoring policy is absent.');
  const relevant = results.filter(r => r.viewport === viewport && (fixtures ? r.provenance === 'fixture' : r.provenance !== 'fixture'));
  const usedIssues = new Set<string>();
  const criteria = rubric.axes.map(axis => {
    const check = rubric.criteria.find(c => c.axis === axis.id && c.role === 'points')!;
    const candidates = relevant.filter(r => r.criterionId === check.id);
    if (candidates.length > 1) throw new AppError('Duplicate criterion results cannot contribute points.');
    const r = candidates[0];
    const assessed = r?.status === 'assessed' && r.score !== null && r.evidenceIds.length > 0 && check.scoreValues?.includes(r.score);
    if (assessed && r.score! < axis.weight! && policy.issueCatalog.length && !policy.issueCatalog.some(i => i.id === r.issueId && i.home === axis.id)) throw new AppError('Lost points require an identified issue with one penalty home.');
    if (assessed && r.issueId) { if (usedIssues.has(r.issueId)) throw new AppError('Overlapping issue has more than one penalty home.'); usedIssues.add(r.issueId); }
    return { id: axis.id, title: axis.title, max: axis.weight!, points: assessed ? r.score : null, evidenceIds: r?.evidenceIds ?? [], reason: r?.reason ?? 'Unknown: no criterion observation.' };
  });
  const assessed = criteria.filter(c => c.points !== null);
  const observedSubtotal = assessed.length ? assessed.reduce((sum, c) => sum + c.points!, 0) : null;
  const rawTotal = assessed.length === criteria.length ? observedSubtotal : null;
  const dealBreakers = policy.dealBreakers.map(rule => {
    const matches = observations.filter(o => o.id === rule.id);
    if (matches.length > 1) throw new AppError('Duplicate deal-breaker observations.');
    const o = matches[0];
    const verified = !!o?.verified && o.evidenceKind === rule.requires && o.evidenceIds.length > 0;
    return { id: rule.id, applicable: o?.applicable ?? null, verdict: verified ? o.verdict : 'unknown', verified, evidenceIds: verified ? o.evidenceIds : [], evidenceKind: verified ? o.evidenceKind : 'none' } as DealBreakerObservation;
  });
  const capApplied = dealBreakers.some(o => o.applicable === true && o.verified && o.verdict === 'fail');
  const cappedTotal = rawTotal === null ? null : capApplied ? Math.min(rawTotal, policy.cap) : rawTotal;
  const unresolved = [...policy.unresolved];
  if (criteria.some(c => c.points === null)) unresolved.push('Incomplete criterion points: no full total or missing-evidence normalization.');
  if (dealBreakers.some(o => o.verdict === 'unknown' && o.applicable !== false)) unresolved.push('Applicable deal-breaker status is not fully established.');
  return { policyVersion: policy.version, policyStatus: policy.status, criteria, coverage: { assessedCriteria: assessed.length, totalCriteria: criteria.length, assessedWeight: assessed.reduce((sum, c) => sum + c.max, 0) }, observedSubtotal, rawTotal, dealBreakers, capApplied, cap: policy.cap, cappedTotal, band: cappedTotal === null ? null : policy.bands.find(b => cappedTotal >= b.min && cappedTotal <= b.max)?.label ?? null, unresolved };
}
