import type { Capture, DealBreakerObservation, MeasuredNode, Viewport } from '../domain.ts';

// Maps deterministic capture measurements onto the proposed Combined
// deal-breakers. A rule is verified only when every measured node resolved;
// any unmeasured node (image or gradient background) leaves a pass unknown.
// A single measured failure is a verified failure. Rules without a connected
// verifier (focus, color-only, feedback delay, non-text and placeholder
// contrast) are not observed here and stay unknown in the summary.
function observe(id: string, nodes: MeasuredNode[], evidenceIds: string[], kind: DealBreakerObservation['evidenceKind']): DealBreakerObservation {
  if (!nodes.length) return { id, applicable: false, verdict: 'unknown', verified: false, evidenceIds, evidenceKind: kind };
  const verdict = nodes.some(n => n.outcome === 'fail') ? 'fail' : nodes.every(n => n.outcome === 'pass') ? 'pass' : 'unknown';
  return { id, applicable: true, verdict, verified: verdict !== 'unknown', evidenceIds, evidenceKind: kind };
}

export function dealBreakerObservations(captures: Capture[], viewport: Viewport): DealBreakerObservation[] {
  const observations: DealBreakerObservation[] = [];
  const measurementIds = (c: Capture) => c.artifacts.filter(a => a.kind === 'measurements').map(a => a.id);
  const capture = captures.find(c => c.viewport === viewport && c.status === 'ready');
  const m = capture?.measurements;
  if (capture && m?.engine) {
    const ids = measurementIds(capture);
    // axe expects 3:1 for large text and 4.5:1 otherwise; unclassified nodes count as body text.
    observations.push(observe('BODY_CONTRAST', m.contrast.filter(n => n.expected !== 3), ids, 'measurement'));
    observations.push(observe('LARGE_TEXT_CONTRAST', m.contrast.filter(n => n.expected === 3), ids, 'measurement'));
    observations.push(observe('TARGET_SIZE', m.targetSize, ids, 'measurement'));
  }
  // Reflow at 320 px is a page property measured once in the mobile context.
  const mobile = captures.find(c => c.viewport === 'mobile' && c.status === 'ready');
  const reflow = mobile?.measurements?.reflow320;
  if (mobile && reflow) {
    const overflow = reflow.scrollWidth > reflow.clientWidth + 1;
    observations.push({ id: 'MOBILE_REFLOW', applicable: true, verdict: overflow ? 'fail' : 'pass', verified: true, evidenceIds: measurementIds(mobile), evidenceKind: 'matched_mobile_320' });
  }
  return observations;
}
