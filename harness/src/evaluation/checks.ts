import type { Capture, Criterion, Profile, Result } from '../domain.ts';

export function unassessed(criterion: Criterion, capture: Capture, reason: string, status: Result['status'] = 'not_assessed'): Result {
  return { criterionId: criterion.id, viewport: capture.viewport, channel: criterion.channel, axis: criterion.axis, status, score: null, provenance: 'unsupported', reason, evidenceIds: [], findingId: null, confidence: null };
}

export function missingEvidence(criterion: Criterion, capture: Capture, pair: Capture | undefined, profile: Profile): string | null {
  if (capture.status !== 'ready') return capture.reason || 'Capture failed.';
  for (const required of criterion.requires) {
    if (required === 'measurement') return 'Not assessed: no verified composited contrast measurements are connected.';
    if (required === 'runtime') return 'Not assessed: no temporal or scripted interaction evidence. Static inputs cannot establish behavior or motion quality.';
    if (required === 'reference') return 'Not assessed: no authorized matched reference is connected.';
    if (required === 'preferences' && ![profile.taste, profile.avoid, profile.brand].some(v => v.trim())) return 'Not assessed: no explicit preferences supplied.';
    if (required === 'pair') {
      if (!pair || pair.status !== 'ready' || pair.viewport === capture.viewport || pair.url !== capture.url || pair.state !== capture.state || !capture.documentHash || pair.documentHash !== capture.documentHash || pair.artifacts[0]?.runId !== capture.artifacts[0]?.runId) return 'Not assessed: adaptation requires matched desktop/mobile captures from the same run, served document and state.';
    } else if (!['preferences', 'runtime', 'reference'].includes(required) && !capture.artifacts.some(a => a.kind === required)) return `Not assessed: missing ${required} evidence.`;
  }
  return null;
}

export function deterministic(criterion: Criterion, capture: Capture): Result {
  const base = unassessed(criterion, capture, 'No deterministic verifier for this criterion.');
  let defect: boolean;
  let reason: string;
  if (capture.facts.truncated) return { ...base, reason: 'Extraction exceeded the element budget; no passing result inferred from a partial sample.' };
  if (criterion.rule === 'overflow') {
    defect = capture.facts.scrollWidth > capture.facts.clientWidth + (criterion.threshold ?? 1);
    reason = `Document ${capture.facts.scrollWidth}px; viewport ${capture.facts.clientWidth}px. This checks horizontal overflow only.`;
  } else if (criterion.rule === 'small-text') {
    const text = capture.facts.elements.filter(e => e.text && e.tag !== 'img' && e.fontSize > 0);
    if (!text.length) return { ...base, reason: 'No text-size evidence.' };
    const small = text.filter(e => e.fontSize < (criterion.threshold ?? 14));
    defect = small.length > 0;
    reason = `${small.length} of ${text.length} visible text elements below the configured ${criterion.threshold ?? 14}px minimum. Smallest ${Math.min(...text.map(e => e.fontSize))}px. This is typography, not message clarity.`;
  } else if (criterion.rule === 'image-alt') {
    const images = capture.facts.elements.filter(e => e.tag === 'img');
    if (!images.length) return { ...base, status: 'not_applicable', reason: 'No img elements in the visible captured evidence.' };
    const missing = images.filter(e => e.alt === null);
    defect = missing.length > 0;
    reason = `${missing.length} of ${images.length} visible img elements lack alt attributes. Alternative-text quality and accessibility compliance remain unassessed.`;
  } else return base;
  return { ...base, status: 'assessed', score: defect ? 1 : 4, provenance: 'measured', reason, findingId: defect ? criterion.findings[0]?.id ?? null : null, evidenceIds: capture.artifacts.filter(a => ['dom', 'styles', 'screenshot'].includes(a.kind)).map(a => a.id) };
}
