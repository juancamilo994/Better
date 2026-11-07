import { abstain, type Judge, type JudgeInput } from './interface.ts';
import type { Result } from '../domain.ts';

// Deliberate sample judgments, not a model simulation. Applied only to the
// built-in controlled website; no sample score is assigned to an arbitrary URL.
const RATINGS: Record<string, [number, number]> = { 'HIER-01': [2, 3], 'TYPE-02': [3, 3], 'CRAFT-01': [3, 2], 'INT-01': [3, 3], 'ADAPT-01': [2, 3], 'FIT-01': [3, 3], 'TASTE-01': [2, 3] };
export class FixtureJudge implements Judge {
  readonly version = 'controlled-demo-fixture-v1';
  readonly provenance = 'fixture' as const;
  async evaluate(input: JudgeInput): Promise<Result> {
    if (input.source !== 'controlled_demo') return abstain(input, 'fixture', 'Setup needed: fixtures do not judge public websites. Configure an authorized real judge.');
    const ratings = RATINGS[input.criterion.id];
    if (!ratings || !input.images.length) return abstain(input, 'fixture', 'No fixture exists for this criterion.');
    const score = ratings[input.demoVersion === 'baseline' ? 0 : 1];
    return { criterionId: input.criterion.id, viewport: input.capture.viewport, channel: input.criterion.channel, axis: input.criterion.axis, status: 'assessed', score, provenance: 'fixture', reason: 'SAMPLE DATA: authored fixture decision, not an actual visual assessment.', evidenceIds: input.images.map(i => i.evidenceId), findingId: score < 3 ? input.criterion.findings[0]?.id ?? null : null, confidence: null };
  }
}
