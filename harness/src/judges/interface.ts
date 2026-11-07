import type { Capture, Criterion, Profile, Result, Run } from '../domain.ts';

export interface JudgeInput {
  criterion: Criterion; capture: Capture; pairedCapture?: Capture; profile: Profile;
  source: Run['source']; demoVersion: 'baseline' | 'revised';
  images: { evidenceId: string; mediaType: 'image/png'; base64: string }[];
}
export interface Judge {
  readonly version: string;
  readonly provenance: 'fixture' | 'subq';
  evaluate(input: JudgeInput): Promise<Result>;
}
export class JudgeError extends Error {
  code: string;
  constructor(code: string) { super(code); this.code = code; }
}
export function abstain(input: JudgeInput, provenance: Result['provenance'], reason: string): Result {
  return { criterionId: input.criterion.id, viewport: input.capture.viewport, channel: input.criterion.channel, axis: input.criterion.axis, status: 'not_assessed', score: null, provenance, reason, evidenceIds: [], findingId: null, confidence: null };
}

// Provider-independent boundary: adapters cannot attach another run's evidence,
// change criterion ownership, or turn missing evidence into a passing score.
export function validateDecision(result: Result, input: JudgeInput, judge: Judge): Result {
  const c = input.criterion;
  const supplied = new Set(input.images.map(image => image.evidenceId));
  if (result.criterionId !== c.id || result.viewport !== input.capture.viewport || result.axis !== c.axis || result.channel !== c.channel || result.provenance !== judge.provenance || !['assessed', 'not_assessed', 'not_applicable', 'failed'].includes(result.status)) throw new JudgeError('invalid_decision');
  if (new Set(result.evidenceIds).size !== result.evidenceIds.length || result.evidenceIds.some(id => !supplied.has(id)) || (result.findingId && !c.findings.some(f => f.id === result.findingId))) throw new JudgeError('invalid_decision');
  if (result.status === 'assessed') {
    if (!Number.isInteger(result.score) || result.score! < 1 || result.score! > 4 || !result.evidenceIds.length) throw new JudgeError('invalid_decision');
    if (c.requires.includes('pair') && result.evidenceIds.length !== supplied.size) throw new JudgeError('invalid_decision');
  } else if (result.score !== null || result.findingId !== null) throw new JudgeError('invalid_decision');
  return result;
}
