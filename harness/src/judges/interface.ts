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
