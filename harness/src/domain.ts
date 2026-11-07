import { z } from 'zod';
import type { Assessment } from './evaluation/evidence.ts';
import type { Layer3Summary } from './evaluation/layer3.ts';

export type Viewport = 'desktop' | 'mobile';
export type Channel = 'quality' | 'taste' | 'ai-isms' | 'motion' | 'reference';
export const profileSchema = z.object({
  version: z.string().min(1).max(80), task: z.string().min(1).max(600),
  audience: z.string().min(1).max(600), feeling: z.string().min(1).max(600).optional(), taste: z.string().max(1000),
  avoid: z.string().max(1000), brand: z.string().max(1000),
  taskSteps: z.array(z.object({ id: z.string().min(1).max(80), goal: z.string().min(1).max(600), intendedOutcome: z.string().min(1).max(600) })).min(1).max(20).refine(steps=>new Set(steps.map(s=>s.id)).size===steps.length,'Task step IDs must be unique.').optional(),
});
export type Profile = z.infer<typeof profileSchema>;
const findingSchema = z.object({
  id: z.string().regex(/^[A-Z0-9_-]+$/), label: z.string(), problem: z.string(),
  change: z.string(), effect: z.string(), priority: z.enum(['high', 'medium', 'low']),
  example: z.enum(['hierarchy', 'spacing', 'type']).optional(),
  dependencies: z.array(z.string()).default([]), conflicts: z.array(z.string()).default([]),
});
export const criterionSchema = z.object({
  id: z.string().regex(/^[A-Z0-9-]+$/), axis: z.string().nullable(),
  title: z.string(), channel: z.enum(['quality', 'taste', 'ai-isms', 'motion', 'reference']),
  lane: z.enum(['deterministic', 'visual', 'unsupported']),
  rule: z.enum(['overflow', 'small-text', 'image-alt', 'type-scale', 'spacing-scale', 'generic-labels']).optional(),
  threshold: z.number().optional(), weight: z.number().nonnegative(),
  instructions: z.string(), requires: z.array(z.enum(['screenshot', 'dom', 'styles', 'text', 'pair', 'runtime', 'measurement', 'reference', 'preferences'])),
  anchors: z.array(z.string()), scoreValues: z.array(z.number().finite()).optional(),
  role: z.enum(['points', 'supporting']).optional(),
  findings: z.array(findingSchema),
});
export type Criterion = z.infer<typeof criterionSchema>;
export const rubricSchema = z.object({
  version: z.string(), status: z.string(), axes: z.array(z.object({ id: z.string().min(1), title: z.string(), weight: z.number().positive().optional() })).min(1),
  criteria: z.array(criterionSchema),
  combined: z.object({ version: z.string(), status: z.literal('proposed'), cap: z.number().min(0).max(100),
    bands: z.array(z.object({ min: z.number(), max: z.number(), label: z.string() })),
    unresolved: z.array(z.string()),
    issueCatalog: z.array(z.object({ id: z.string(), home: z.string(), description: z.string() })).default([]),
    feedbackTargetMs: z.number().positive(), feedbackDealBreakerMs: z.number().positive(),
    dealBreakers: z.array(z.object({ id: z.string(), title: z.string(), requires: z.enum(['runtime', 'measurement', 'matched_mobile_320']) })),
    pairwise: z.object({ enabled: z.literal(false) }).passthrough(),
  }).passthrough().optional(),
}).superRefine((r, ctx) => {
  if (r.combined) {
    if (r.axes.reduce((sum, a) => sum + (a.weight ?? 0), 0) !== 100) ctx.addIssue({ code: 'custom', message: 'Combined criterion weights must total 100.' });
    if (new Set(r.combined.issueCatalog.map(i => i.id)).size !== r.combined.issueCatalog.length || r.combined.issueCatalog.some(i => !r.axes.some(a => a.id === i.home))) ctx.addIssue({ code: 'custom', message: 'Issues need unique identities and a configured scoring home.' });
    const points = r.criteria.filter(c => c.role === 'points');
    for (const a of r.axes) if (points.filter(c => c.axis === a.id).length !== 1) ctx.addIssue({ code: 'custom', message: 'Each combined criterion needs exactly one points check.' });
    for (const c of points) if (!c.scoreValues || c.scoreValues.length !== c.anchors.length || new Set(c.scoreValues).size !== c.scoreValues.length || c.scoreValues.some(v => v < 0 || v > (r.axes.find(a => a.id === c.axis)?.weight ?? 0))) ctx.addIssue({ code: 'custom', message: 'Point choices must match supplied anchors and criterion weight.' });
    for (let i = 0; i < r.combined.bands.length; i++) { const b = r.combined.bands[i]; if (b.min > b.max || b.min < 0 || b.max > 100 || r.combined.bands.some((other, j) => j !== i && other.min <= b.max && other.max >= b.min)) ctx.addIssue({ code: 'custom', message: 'Score bands must be bounded and nonoverlapping.' }); }
  }
  if (new Set(r.axes.map(a => a.id)).size !== r.axes.length) ctx.addIssue({ code: 'custom', message: 'Axis IDs must be unique.' });
  if (new Set(r.criteria.map(c => c.id)).size !== r.criteria.length) ctx.addIssue({ code: 'custom', message: 'Criterion IDs must be unique.' });
  for (const c of r.criteria) {
    if (c.axis && !r.axes.some(a => a.id === c.axis)) ctx.addIssue({ code: 'custom', message: 'Unknown axis.' });
    if (c.channel === 'quality' && !c.axis) ctx.addIssue({ code: 'custom', message: 'Quality criteria need a home axis.' });
    if (c.channel !== 'quality' && c.axis) ctx.addIssue({ code: 'custom', message: 'Separate channels must not add radar penalties.' });
    if (c.lane === 'deterministic' && !c.rule) ctx.addIssue({ code: 'custom', message: 'Deterministic criteria need a rule.' });
    if (c.lane === 'visual' && !c.findings.length) ctx.addIssue({ code: 'custom', message: 'Visual criteria need at least one bounded finding option.' });
    if (new Set(c.findings.map(f => f.id)).size !== c.findings.length) ctx.addIssue({ code: 'custom', message: 'Finding IDs must be unique.' });
  }
  const findings = r.criteria.flatMap(c => c.findings.map(f => f.id));
  if (new Set(findings).size !== findings.length) ctx.addIssue({ code: 'custom', message: 'Each issue must have one scoring home.' });
});
export type Rubric = z.infer<typeof rubricSchema>;
export interface Artifact { id: string; runId: string; viewport: Viewport; state: 'default-frozen'; kind: 'screenshot' | 'full_screenshot' | 'dom' | 'styles' | 'text' | 'measurements'; file: string; sha256: string; bytes: number; width?: number; height?: number }
export interface MeasuredNode { outcome: 'pass' | 'fail' | 'unknown'; target: string; ratio?: number; expected?: number }
export interface Measurements { engine: string | null; contrast: MeasuredNode[]; targetSize: MeasuredNode[]; spacing: Record<string, number>; reflow320: { scrollWidth: number; clientWidth: number } | null }
export interface ElementFact { id: string; tag: string; text: string; fontSize: number; lineHeight: string; color: string; background: string; width: number; height: number; x: number; y: number; alt: string | null }
export interface Capture {
  viewport: Viewport; width: number; height: number; status: 'ready' | 'failed'; reason?: string;
  url: string; capturedAt: string; state: 'default-frozen'; artifacts: Artifact[];
  facts: { scrollWidth: number; clientWidth: number; elements: ElementFact[]; text: string; title: string; truncated: boolean; brokenImages?: number; headingLevels?: number[]; controls?: string[] };
  browser: string; contentHash: string; documentHash: string; blockedRequests: number;
  failedResources?: number; networkIdle?: boolean; fullPageClipped?: boolean; measurements?: Measurements; pageErrors?: number;
}
export interface Result {
  criterionId: string; viewport: Viewport; channel: Channel; axis: string | null;
  status: 'assessed' | 'not_assessed' | 'not_applicable' | 'failed'; score: number | null;
  issueId?: string;
  provenance: 'measured' | 'fixture' | 'subq' | 'unsupported'; reason: string;
  evidenceIds: string[]; findingId: string | null; confidence: number | null;
}
export interface Suggestion {
  id: string; runId: string; criterionId: string; viewport: Viewport; state: string;
  issueKey: string; label: string; problem: string; change: string; effect: string;
  priority: 'high' | 'medium' | 'low'; provenance: Result['provenance'];
  evidenceIds: string[]; example?: 'hierarchy' | 'spacing' | 'type'; dependencies: string[]; conflicts: string[];
}
export interface AxisScore { axis: string; score: number | null; assessed: number; total: number; complete: boolean; fixture: boolean }
export interface Run {
  id: string; projectId: string; parentRunId: string | null; createdAt: string;
  status: 'complete' | 'partial' | 'failed' | 'setup_needed'; mode: 'fixture' | 'subq';
  buildLabel: string; source: 'public_url' | 'controlled_demo';
  rubric: Rubric; profile: Profile; versions: Record<string, string>;
  captures: Capture[]; results: Result[]; suggestions: Suggestion[];
  axes: Record<Viewport, AxisScore[]>; fixtureAxes: Record<Viewport, AxisScore[]>;
  quality?: Record<Viewport, QualitySummary>;
  fixtureQuality?: Record<Viewport, QualitySummary>;
  assessment?: Assessment;
  manifest: { os: string; browser: string; readiness: string; expectedText: string | null; deviceScale: number; input: Record<Viewport, string>; state: string; capturedBuildHash: string; repositorySource: 'not_connected'; referenceIds: string[] };
  judgeAttempts: { viewport: Viewport; criterionId: string; status: string; code: string }[];
}
export interface Project { id: string; name: string; url: string; source: Run['source']; createdAt: string; profile: Profile; archivedAt?: string }
export interface Handoff { id: string; runId: string; createdAt: string; selectedIds: string[]; deferredIds: string[]; prompt: string }
export interface Correction { id: string; runId: string; criterionId: string; viewport: Viewport; createdAt: string; note: string }
export class AppError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }

export interface DealBreakerObservation { id: string; applicable: boolean | null; verdict: 'pass' | 'fail' | 'unknown'; verified: boolean; evidenceIds: string[]; evidenceKind: 'runtime' | 'measurement' | 'matched_mobile_320' | 'static' | 'none' }
export interface QualitySummary { policyVersion: string; policyStatus: 'proposed'; criteria: { id: string; title: string; max: number; points: number | null; evidenceIds: string[]; reason: string }[]; coverage: { assessedCriteria: number; totalCriteria: number; assessedWeight: number }; observedSubtotal: number | null; rawTotal: number | null; dealBreakers: DealBreakerObservation[]; capApplied: boolean; cap: number; cappedTotal: number | null; band: string | null; unresolved: string[]; layer3?: Layer3Summary }
