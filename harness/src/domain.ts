import { z } from 'zod';

export const AXES = ['HIER', 'LAY', 'TYPE', 'ACC', 'CRAFT', 'INT', 'ADAPT', 'FIT'] as const;
export type Viewport = 'desktop' | 'mobile';
export type Channel = 'quality' | 'taste' | 'ai-isms' | 'motion' | 'reference';
export const profileSchema = z.object({
  version: z.string().min(1).max(80), task: z.string().min(1).max(600),
  audience: z.string().min(1).max(600), taste: z.string().max(1000),
  avoid: z.string().max(1000), brand: z.string().max(1000),
});
export type Profile = z.infer<typeof profileSchema>;
const findingSchema = z.object({
  id: z.string().regex(/^[A-Z0-9_-]+$/), label: z.string(), problem: z.string(),
  change: z.string(), effect: z.string(), priority: z.enum(['high', 'medium', 'low']),
  example: z.enum(['hierarchy', 'spacing', 'type']).optional(),
  dependencies: z.array(z.string()).default([]), conflicts: z.array(z.string()).default([]),
});
export const criterionSchema = z.object({
  id: z.string().regex(/^[A-Z0-9-]+$/), axis: z.enum(AXES).nullable(),
  title: z.string(), channel: z.enum(['quality', 'taste', 'ai-isms', 'motion', 'reference']),
  lane: z.enum(['deterministic', 'visual', 'unsupported']),
  rule: z.enum(['overflow', 'small-text', 'image-alt']).optional(),
  threshold: z.number().optional(), weight: z.number().nonnegative(),
  instructions: z.string(), requires: z.array(z.enum(['screenshot', 'dom', 'styles', 'text', 'pair', 'runtime', 'reference', 'preferences'])),
  anchors: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  findings: z.array(findingSchema),
});
export type Criterion = z.infer<typeof criterionSchema>;
export const rubricSchema = z.object({
  version: z.string(), status: z.string(), axes: z.array(z.object({ id: z.enum(AXES), title: z.string() })),
  criteria: z.array(criterionSchema),
}).superRefine((r, ctx) => {
  if (r.axes.map(a => a.id).join() !== AXES.join()) ctx.addIssue({ code: 'custom', message: 'Keep the eight radar axes in order.' });
  if (new Set(r.criteria.map(c => c.id)).size !== r.criteria.length) ctx.addIssue({ code: 'custom', message: 'Criterion IDs must be unique.' });
  for (const c of r.criteria) {
    if (c.channel === 'quality' && !c.axis) ctx.addIssue({ code: 'custom', message: 'Quality criteria need a home axis.' });
    if (c.channel !== 'quality' && c.axis) ctx.addIssue({ code: 'custom', message: 'Separate channels must not add radar penalties.' });
    if (c.lane === 'deterministic' && !c.rule) ctx.addIssue({ code: 'custom', message: 'Deterministic criteria need a rule.' });
    if (new Set(c.findings.map(f => f.id)).size !== c.findings.length) ctx.addIssue({ code: 'custom', message: 'Finding IDs must be unique.' });
  }
});
export type Rubric = z.infer<typeof rubricSchema>;
export interface Artifact { id: string; runId: string; viewport: Viewport; state: 'default-frozen'; kind: 'screenshot' | 'dom' | 'styles' | 'text'; file: string; sha256: string; bytes: number }
export interface ElementFact { id: string; tag: string; text: string; fontSize: number; lineHeight: string; color: string; background: string; width: number; height: number; x: number; y: number; alt: string | null }
export interface Capture {
  viewport: Viewport; width: number; height: number; status: 'ready' | 'failed'; reason?: string;
  url: string; capturedAt: string; state: 'default-frozen'; artifacts: Artifact[];
  facts: { scrollWidth: number; clientWidth: number; elements: ElementFact[]; text: string; title: string; truncated: boolean };
  browser: string; contentHash: string; documentHash: string; blockedRequests: number;
}
export interface Result {
  criterionId: string; viewport: Viewport; channel: Channel; axis: string | null;
  status: 'assessed' | 'not_assessed' | 'not_applicable' | 'failed'; score: number | null;
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
  manifest: { os: string; browser: string; readiness: string; expectedText: string | null; deviceScale: number; input: Record<Viewport, string>; state: string; capturedBuildHash: string; repositorySource: 'not_connected'; referenceIds: string[] };
  judgeAttempts: { viewport: Viewport; criterionId: string; status: string; code: string }[];
}
export interface Project { id: string; name: string; url: string; source: Run['source']; createdAt: string; profile: Profile }
export interface Handoff { id: string; runId: string; createdAt: string; selectedIds: string[]; deferredIds: string[]; prompt: string }
export interface Correction { id: string; runId: string; criterionId: string; viewport: Viewport; createdAt: string; note: string }
export class AppError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
