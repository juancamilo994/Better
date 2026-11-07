import { abstain, type Judge, type JudgeInput } from './interface.ts';
import type { Result } from '../domain.ts';

// Deliberate sample judgments, not a model simulation. Applied only to the
// built-in controlled website; no sample score is assigned to an arbitrary URL.
const RATINGS: Record<string, [number, number]> = { 'HIER-01': [2, 3], 'TYPE-02': [3, 3], 'CRAFT-01': [3, 2], 'INT-01': [3, 3], 'ADAPT-01': [2, 3], 'FIT-01': [3, 3], 'TASTE-01': [2, 3] };
// Combined points: index into each criterion's configured choices [zero, half, full],
// as [baseline, revised]. Authored to show improvement, flat criteria and one
// regression (Visual communication). SAMPLE DATA, never a calibrated rating.
const POINT_CHOICES: Record<string, [number, number]> = {
  'HIER-POINTS': [1, 2], 'DENSITY-POINTS': [1, 2], 'FLOW-POINTS': [2, 2], 'INTERACTION-POINTS': [1, 1], 'AUDIENCE-POINTS': [2, 2],
  'ORIGINALITY-POINTS': [1, 1], 'VISUAL-POINTS': [2, 1], 'SYSTEM-POINTS': [1, 1], 'TYPOGRAPHY-POINTS': [1, 2], 'USABILITY-POINTS': [1, 2],
};
export class FixtureJudge implements Judge {
  readonly version = 'controlled-demo-fixture-v2';
  readonly provenance = 'fixture' as const;
  async evaluate(input: JudgeInput): Promise<Result> {
    if (input.source !== 'controlled_demo') return abstain(input, 'fixture', 'Setup needed: fixtures do not judge public websites. Configure an authorized real judge.');
    const c = input.criterion;
    const base = { criterionId: c.id, viewport: input.capture.viewport, channel: c.channel, axis: c.axis, status: 'assessed' as const, provenance: 'fixture' as const, reason: 'SAMPLE DATA: authored fixture decision, not an actual visual assessment.', evidenceIds: input.images.map(i => i.evidenceId), confidence: null };
    const choice = POINT_CHOICES[c.id];
    if (choice && c.scoreValues && input.images.length) {
      const score = c.scoreValues[choice[input.demoVersion === 'baseline' ? 0 : 1]];
      const full = score === Math.max(...c.scoreValues);
      const issue = input.issues?.find(i => i.home === c.axis);
      return { ...base, score, findingId: full ? null : c.findings[0]?.id ?? null, ...(!full && issue ? { issueId: issue.id } : {}) };
    }
    const ratings = RATINGS[c.id];
    if (!ratings || !input.images.length) return abstain(input, 'fixture', 'No fixture exists for this criterion.');
    const score = ratings[input.demoVersion === 'baseline' ? 0 : 1];
    return { ...base, score, findingId: score < 3 ? c.findings[0]?.id ?? null : null };
  }
}

// Authored Layer 3 detector findings for the controlled demo only. SAMPLE DATA:
// declares full rule coverage so the demo shows a complete ledger.
export function fixtureDetectorResult(demoVersion: 'baseline' | 'revised', ruleIds: string[]) {
  const findings = demoVersion === 'baseline'
    ? [{ id: 'cream-beige-palette', snippet: 'SAMPLE: cream page background #f7f5ef' }, { id: 'icon-tile-above-heading', snippet: 'SAMPLE: decorative tile above each card heading' }, { id: 'icon-tile-above-heading', snippet: 'SAMPLE: repeated on the second card' }, { id: 'kicker-above-heading', snippet: 'SAMPLE: small uppercase label above a heading' }, { id: 'straggler', snippet: 'SAMPLE: one word alone on a paragraph last line' }]
    : [{ id: 'cream-beige-palette', snippet: 'SAMPLE: cream page background #f7f5ef' }, { id: 'straggler', snippet: 'SAMPLE: one word alone on a paragraph last line' }];
  return { tool: 'impeccable' as const, version: 'controlled-demo-detector-fixture-v1', url: 'https://better-demo.invalid/', attested: true, rulesRun: ruleIds, findings };
}
