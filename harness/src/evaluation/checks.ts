import type { Capture, Criterion, Profile, Result } from '../domain.ts';

export function unassessed(criterion: Criterion, capture: Capture, reason: string, status: Result['status'] = 'not_assessed'): Result {
  return { criterionId: criterion.id, viewport: capture.viewport, channel: criterion.channel, axis: criterion.axis, status, score: null, provenance: 'unsupported', reason, evidenceIds: [], findingId: null, confidence: null };
}

export function missingEvidence(criterion: Criterion, capture: Capture, pair: Capture | undefined, profile: Profile): string | null {
  if (capture.status !== 'ready') return capture.reason || 'Capture failed.';
  for (const required of criterion.requires) {
    if (required === 'measurement') { if (!capture.artifacts.some(a => a.kind === 'measurements') || !capture.measurements) return 'Not assessed: no deterministic page measurements in this capture.'; continue; }
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
  } else if (criterion.rule === 'type-scale') {
    // Combined rubric, Typography: more than about five distinct text sizes is a warning sign.
    const sizes = new Set(capture.facts.elements.filter(e => e.text && e.tag !== 'img' && e.fontSize > 0).map(e => Math.round(e.fontSize * 2) / 2));
    if (!sizes.size) return { ...base, reason: 'No text-size evidence.' };
    defect = sizes.size > (criterion.threshold ?? 5);
    reason = `${sizes.size} distinct visible text sizes (${[...sizes].sort((a, b) => a - b).join(', ')}px); configured warning above ${criterion.threshold ?? 5}. Sampled from extracted text elements.`;
  } else if (criterion.rule === 'spacing-scale') {
    // Combined rubric, System consistency: one 4/8 px spacing scale.
    const scale = new Set([4, 8, 12, 16, 24, 32, 48, 64, 96]);
    const counts = Object.entries(capture.measurements?.spacing ?? {}).map(([value, count]) => ({ value: Number(value), count }));
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    if (!total) return { ...base, reason: 'No spacing measurements.' };
    const onScale = counts.filter(c => scale.has(c.value)).reduce((sum, c) => sum + c.count, 0) / total;
    defect = onScale < (criterion.threshold ?? 0.75);
    const offenders = counts.filter(c => !scale.has(c.value)).sort((a, b) => b.count - a.count).slice(0, 5).map(c => `${c.value}px×${c.count}`);
    reason = `${Math.round(onScale * 100)}% of ${total} margin, padding and gap values sit on the 4/8 px scale; proposed minimum ${Math.round((criterion.threshold ?? 0.75) * 100)}%. Most common off-scale: ${offenders.join(', ') || 'none'}.`;
  } else if (criterion.rule === 'generic-labels') {
    // Craft policy: verb plus object, never "Submit" or "OK". Only generic
    // labels are detected; a pass does not verify verb-plus-object wording.
    const controls = capture.facts.controls;
    if (!controls) return { ...base, reason: 'No control-label evidence in this capture.' };
    if (!controls.length) return { ...base, status: 'not_applicable', reason: 'No visible buttons in the captured state.' };
    const generic = new Set(['submit', 'ok', 'okay', 'click here', 'click', 'go', 'send', 'yes', 'no']);
    const found = [...new Set(controls.filter(label => generic.has(label.toLowerCase().replace(/[.!…]+$/, ''))))];
    defect = found.length > 0;
    reason = `${found.length ? `Generic action labels: ${found.map(l => JSON.stringify(l)).join(', ')}` : 'No generic action labels'} among ${controls.length} visible buttons. Verb-plus-object wording itself is not verified by this check.`;
  } else if (criterion.rule === 'image-alt') {
    const images = capture.facts.elements.filter(e => e.tag === 'img');
    if (!images.length) return { ...base, status: 'not_applicable', reason: 'No img elements in the visible captured evidence.' };
    const missing = images.filter(e => e.alt === null);
    defect = missing.length > 0;
    reason = `${missing.length} of ${images.length} visible img elements lack alt attributes. Alternative-text quality and accessibility compliance remain unassessed.`;
  } else return base;
  return { ...base, status: 'assessed', score: defect ? 1 : 4, provenance: 'measured', reason, findingId: defect ? criterion.findings[0]?.id ?? null : null, evidenceIds: capture.artifacts.filter(a => ['dom', 'styles', 'screenshot', ...(criterion.rule === 'spacing-scale' ? ['measurements'] : [])].includes(a.kind)).map(a => a.id) };
}
