import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppError, type Capture, type QualitySummary, type Rubric, type Suggestion, type Viewport } from '../domain.ts';

// Layer 3: detector rules run after Layers 1/2 (visual judge points and
// measured deal-breakers). This module ingests detector results through a
// versioned adapter and keeps an auditable ledger: raw points, rule mappings,
// deductions, exceptions, adjudications and caps stay separate. Where the
// source policy is ambiguous the affected value is unknown, never guessed.

const ruleSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/), title: z.string(), catches: z.string(),
  category: z.enum(['ai-tell', 'quality']), severity: z.enum(['flag', 'advisory', 'error', 'unresolved']),
  gate: z.boolean(), criteria: z.array(z.string()), severityNote: z.string().optional(),
  detectorIds: z.object({ impeccable: z.array(z.string()) }), nativeVerifier: z.string().nullable().optional(),
  exceptions: z.array(z.object({ id: z.string(), reason: z.string(), requires: z.literal('adjudication') })),
});
export const detectorRegistrySchema = z.object({
  version: z.string(), status: z.literal('proposed'), source: z.string(), detectors: z.record(z.string(), z.object({ mappingBasis: z.string() })),
  policy: z.object({
    flagPoints: z.number().positive(), advisoryPoints: z.number().positive(), advisoryRequiresAdjudication: z.literal(true),
    repeatCountsOncePerCriterion: z.literal(true), gateCap: z.number().min(0).max(100),
    aiTellOriginality: z.object({ criterion: z.string(), minimumFlags: z.number().int().positive(), capPoints: z.number().nonnegative() }),
    multiCriterionCharging: z.literal('each-mapped-criterion'), unresolved: z.array(z.string()),
  }),
  rules: z.array(ruleSchema),
}).superRefine((r, ctx) => {
  if (new Set(r.rules.map(x => x.id)).size !== r.rules.length) ctx.addIssue({ code: 'custom', message: 'Detector rule IDs must be unique.' });
  const ids = r.rules.flatMap(x => x.detectorIds.impeccable);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'A detector ID maps to one rubric rule.' });
  for (const x of r.rules) if (x.gate === (x.criteria.length > 0)) ctx.addIssue({ code: 'custom', message: `Rule ${x.id} must be a gate or map to criteria, not both.` });
});
export type DetectorRegistry = z.infer<typeof detectorRegistrySchema>;
export type DetectorRule = DetectorRegistry['rules'][number];

export function loadDetectorRegistry(rubric: Rubric, path = process.env.BETTER_DETECTOR_RULES_PATH || 'config/detector-rules.json'): DetectorRegistry {
  const registry = detectorRegistrySchema.parse(JSON.parse(readFileSync(resolve(path), 'utf8')));
  const axes = new Set(rubric.axes.map(a => a.id));
  if (registry.rules.some(r => r.criteria.some(c => !axes.has(c))) || !axes.has(registry.policy.aiTellOriginality.criterion)) throw new AppError('Detector registry maps to an unknown criterion.');
  return registry;
}

// External detector results (for example `impeccable detect --json <url>`) are
// untrusted data. The operator wraps the findings with the URL, the detector
// version and which rules actually ran. Unknown rule IDs never affect a score.
export const detectorResultSchema = z.object({
  tool: z.literal('impeccable'), version: z.string().min(1).max(80), url: z.string().url().max(2000),
  viewport: z.enum(['desktop', 'mobile']).optional(),
  attested: z.boolean().default(false),
  rulesRun: z.union([z.literal('all-mapped'), z.array(z.string().max(80)).max(200)]),
  findings: z.array(z.object({ antipattern: z.string().max(80).optional(), id: z.string().max(80).optional(), snippet: z.string().max(400).optional() })).max(2000),
}).strict();
export type DetectorResult = z.infer<typeof detectorResultSchema>;
export const adjudicationSchema = z.object({
  ruleId: z.string().max(80), criterion: z.string().max(40), deliberate: z.boolean(), exceptionId: z.string().max(80).optional(), note: z.string().min(1).max(600),
}).strict();
export type Adjudication = z.infer<typeof adjudicationSchema>;

export type DetectorSource = 'native' | 'impeccable' | 'fixture';
export interface Occurrence { ruleId: string; source: DetectorSource; detectorRuleId: string; snippet: string; viewport: Viewport; evidenceIds: string[]; verified: boolean }
export interface DetectorRun { source: DetectorSource; version: string; viewport: Viewport; coveredRuleIds: string[]; occurrences: Occurrence[]; unmapped: string[]; note: string }

export const NATIVE_DETECTOR_VERSION = 'better-native-layer3-1';
const evidence = (c: Capture, kinds: string[]) => c.artifacts.filter(a => kinds.includes(a.kind)).map(a => a.id);

// A handful of rules measured directly from the frozen capture. A rule counts
// as run only when its evidence was available; otherwise it stays unrun.
export function nativeDetector(capture: Capture): DetectorRun {
  const viewport = capture.viewport;
  const run: DetectorRun = { source: 'native', version: NATIVE_DETECTOR_VERSION, viewport, coveredRuleIds: [], occurrences: [], unmapped: [], note: 'Deterministic rules measured on the frozen capture.' };
  if (capture.status !== 'ready') return run;
  const fire = (ruleId: string, snippet: string, kinds: string[], verified = true) => run.occurrences.push({ ruleId, source: 'native', detectorRuleId: ruleId, snippet, viewport, evidenceIds: evidence(capture, kinds), verified });
  const f = capture.facts;
  if (f.brokenImages !== undefined) { run.coveredRuleIds.push('broken-image'); if (f.brokenImages > 0) fire('broken-image', `${f.brokenImages} visible image(s) with an empty source or failed decode`, ['dom', 'screenshot']); }
  // Blocked or failed subresources can cause script errors the site would not
  // have, so errors only count when every request loaded.
  if (capture.pageErrors !== undefined && !capture.blockedRequests && !capture.failedResources) { run.coveredRuleIds.push('script-error-on-load'); if (capture.pageErrors > 0) fire('script-error-on-load', `${capture.pageErrors} uncaught script error(s) during load`, ['dom']); }
  const contrast = capture.measurements?.engine ? capture.measurements.contrast : null;
  if (contrast) {
    const failed = contrast.filter(n => n.outcome === 'fail');
    if (failed.length) { run.coveredRuleIds.push('low-contrast-text'); fire('low-contrast-text', `${failed.length} text node(s) below the required ratio, e.g. ${failed[0].target} at ${failed[0].ratio ?? '?'}:1`, ['measurements']); }
    else if (contrast.length && contrast.every(n => n.outcome === 'pass')) run.coveredRuleIds.push('low-contrast-text');
  }
  if (!f.truncated && f.elements.length) {
    const body = f.elements.filter(e => ['p', 'li'].includes(e.tag) && e.text.length >= 20 && e.fontSize > 0);
    const ui = f.elements.filter(e => ['a', 'button', 'label'].includes(e.tag) && e.text && e.fontSize > 0);
    run.coveredRuleIds.push('tiny-body-text', 'undersized-ui-text');
    const tiny = body.filter(e => e.fontSize < 12); if (tiny.length) fire('tiny-body-text', `${tiny.length} body text element(s) under 12px, smallest ${Math.min(...tiny.map(e => e.fontSize))}px`, ['styles']);
    const small = ui.filter(e => e.fontSize < 11); if (small.length) fire('undersized-ui-text', `${small.length} button, label or link element(s) under 11px`, ['styles']);
  }
  if (f.headingLevels) {
    run.coveredRuleIds.push('skipped-heading-level');
    const skip = f.headingLevels.findIndex((level, i) => i > 0 && level > f.headingLevels![i - 1] + 1);
    if (skip > 0) fire('skipped-heading-level', `h${f.headingLevels[skip - 1]} followed by h${f.headingLevels[skip]}`, ['dom']);
  }
  return run;
}

export function adaptDetectorResult(registry: DetectorRegistry, result: DetectorResult, projectUrl: string, viewport: Viewport, source: DetectorSource = 'impeccable'): DetectorRun {
  if (source === 'impeccable' && new URL(result.url).href !== new URL(projectUrl).href) throw new AppError('Detector result URL does not match this project.');
  const byDetectorId = new Map(registry.rules.flatMap(r => r.detectorIds.impeccable.map(id => [id, r] as const)));
  const covered = result.rulesRun === 'all-mapped' ? registry.rules.filter(r => r.detectorIds.impeccable.length).map(r => r.id) : [...new Set(result.rulesRun.map(id => byDetectorId.get(id)?.id ?? (registry.rules.some(r => r.id === id) && source === 'fixture' ? id : undefined)).filter((x): x is string => !!x))];
  const run: DetectorRun = { source, version: result.version, viewport, coveredRuleIds: covered, occurrences: [], unmapped: [], note: source === 'fixture' ? 'SAMPLE DATA: authored detector findings for the controlled demo.' : `Operator-supplied ${result.tool} ${result.version} result${result.attested ? ', attested for this URL' : ', not attested'}.` };
  for (const finding of result.findings) {
    const detectorRuleId = finding.antipattern ?? finding.id ?? '';
    const rule = byDetectorId.get(detectorRuleId) ?? (source === 'fixture' ? registry.rules.find(r => r.id === detectorRuleId) : undefined);
    if (!rule) { if (detectorRuleId && !run.unmapped.includes(detectorRuleId)) run.unmapped.push(detectorRuleId); continue; }
    if (!covered.includes(rule.id)) covered.push(rule.id);
    run.occurrences.push({ ruleId: rule.id, source, detectorRuleId, snippet: (finding.snippet ?? '').slice(0, 400), viewport, evidenceIds: [], verified: source === 'fixture' || result.attested });
  }
  return run;
}

export interface Deduction { ruleId: string; title: string; criterion: string; severity: DetectorRule['severity']; category: DetectorRule['category']; occurrences: number; sources: DetectorSource[]; points: number; status: 'applied' | 'pending_adjudication' | 'deliberate' | 'exception' | 'unresolved_severity'; exceptionId?: string; note?: string }
export interface GateResult { ruleId: string; title: string; verdict: 'fail' | 'pass' | 'unknown'; verified: boolean; sources: DetectorSource[]; evidenceIds: string[]; snippet: string | null }
export interface CriterionLedger { id: string; title: string; max: number; raw: number | null; deducted: number; pendingAdvisoryPoints: number; originalityCap: number | null; final: number | null; reason: string }
export interface ReviewItem { priority: 'P0' | 'P1' | 'P2' | 'P3'; criterion: string | null; source: 'deal-breaker' | 'gate' | 'detector' | 'criterion'; label: string; detail: string; suggestionId?: string }
export interface Layer3Summary {
  registryVersion: string; status: 'complete' | 'partial' | 'unrun'; runs: { source: DetectorSource; version: string; covered: number; occurrences: number; unmapped: string[]; note: string }[];
  coverage: { covered: number; total: number; unrunRuleIds: string[] };
  deductions: Deduction[]; gates: GateResult[]; aiTellFlags: number; originalityCapApplied: boolean;
  criteria: CriterionLedger[]; observedSubtotal: number | null; layer3Total: number | null;
  capApplied: boolean; cap: number; cappedTotal: number | null; band: string | null; provisional: boolean; pendingAdvisoryPoints: number;
  unresolved: string[]; review: { topFixes: ReviewItem[]; preserve: string[] };
}

export function scoreLayer3(rubric: Rubric, registry: DetectorRegistry, quality: QualitySummary, runs: DetectorRun[], adjudications: Adjudication[], suggestions: Suggestion[], strengths: string[]): Layer3Summary {
  const policy = registry.policy;
  const covered = new Set(runs.flatMap(r => r.coveredRuleIds));
  const occurrences = runs.flatMap(r => r.occurrences);
  const fired = registry.rules.filter(r => occurrences.some(o => o.ruleId === r.id));
  const unresolved = [...policy.unresolved];
  const gates: GateResult[] = registry.rules.filter(r => r.gate).map(r => {
    const hits = occurrences.filter(o => o.ruleId === r.id);
    const verifiedHit = hits.find(o => o.verified);
    return { ruleId: r.id, title: r.title, verdict: hits.length ? 'fail' : covered.has(r.id) ? 'pass' : 'unknown', verified: hits.length ? !!verifiedHit : covered.has(r.id), sources: [...new Set(hits.map(o => o.source))], evidenceIds: [...new Set(hits.flatMap(o => o.evidenceIds))], snippet: (verifiedHit ?? hits[0])?.snippet ?? null } as GateResult;
  });
  const deductions: Deduction[] = [];
  for (const rule of fired.filter(r => !r.gate)) {
    const hits = occurrences.filter(o => o.ruleId === rule.id);
    // Repeated occurrences count once per mapped criterion.
    for (const criterion of rule.criteria) {
      const decision = adjudications.find(a => a.ruleId === rule.id && a.criterion === criterion);
      const base = { ruleId: rule.id, title: rule.title, criterion, severity: rule.severity, category: rule.category, occurrences: hits.length, sources: [...new Set(hits.map(o => o.source))] };
      if (rule.severity === 'unresolved') { deductions.push({ ...base, points: 0, status: 'unresolved_severity', note: rule.severityNote }); continue; }
      const exception = decision?.exceptionId ? rule.exceptions.find(e => e.id === decision.exceptionId) : undefined;
      if (decision?.exceptionId && !exception) throw new AppError(`Exception ${decision.exceptionId} is not configured for ${rule.id}.`);
      if (exception && decision!.deliberate) { deductions.push({ ...base, points: 0, status: 'exception', exceptionId: exception.id, note: decision!.note }); continue; }
      if (rule.severity === 'advisory') {
        if (!decision) deductions.push({ ...base, points: 0, status: 'pending_adjudication' });
        else deductions.push({ ...base, points: decision.deliberate ? 0 : policy.advisoryPoints, status: decision.deliberate ? 'deliberate' : 'applied', note: decision.note });
        continue;
      }
      deductions.push({ ...base, points: policy.flagPoints, status: 'applied', ...(decision ? { note: decision.note } : {}) });
    }
  }
  const aiTellFlags = fired.filter(r => r.category === 'ai-tell' && r.severity === 'flag' && deductions.some(d => d.ruleId === r.id && d.status === 'applied')).length;
  const originalityCapApplied = aiTellFlags >= policy.aiTellOriginality.minimumFlags;
  const criteria: CriterionLedger[] = quality.criteria.map(c => {
    const own = deductions.filter(d => d.criterion === c.id);
    const deducted = own.filter(d => d.status === 'applied').reduce((s, d) => s + d.points, 0);
    const pendingAdvisoryPoints = own.filter(d => d.status === 'pending_adjudication').length * policy.advisoryPoints;
    const capPoints = originalityCapApplied && c.id === policy.aiTellOriginality.criterion ? policy.aiTellOriginality.capPoints : null;
    const row = { id: c.id, title: c.title, max: c.max, raw: c.points, deducted, pendingAdvisoryPoints, originalityCap: capPoints };
    if (c.points === null) return { ...row, final: null, reason: 'Raw criterion points unknown; Layer 3 cannot settle it.' };
    const deductThenCap = capPoints === null ? c.points - deducted : Math.min(c.points - deducted, capPoints);
    const capThenDeduct = capPoints === null ? c.points - deducted : Math.min(c.points, capPoints) - deducted;
    if (deductThenCap !== capThenDeduct) return { ...row, final: null, reason: `Unresolved order: deduct-then-cap gives ${deductThenCap}, cap-then-deduct gives ${capThenDeduct}.` };
    if (deductThenCap < 0) return { ...row, final: null, reason: `Unresolved floor: deductions (${deducted}) exceed raw points (${c.points}).` };
    return { ...row, final: deductThenCap, reason: deducted || capPoints !== null ? `Raw ${c.points}${deducted ? `, minus ${deducted} from detector rules` : ''}${capPoints !== null ? `, Originality capped at ${capPoints} by ${aiTellFlags} AI-tell flags` : ''}.` : `Raw ${c.points}; no settled detector deduction.` };
  });
  const status: Layer3Summary['status'] = !runs.some(r => r.coveredRuleIds.length) ? 'unrun' : registry.rules.every(r => covered.has(r.id)) ? 'complete' : 'partial';
  if (status !== 'complete') unresolved.push(status === 'unrun' ? 'Layer 3 detector did not run: no Layer 3 total, and no rule counts as passed.' : `Layer 3 coverage is partial (${covered.size} of ${registry.rules.length} rules): no Layer 3 total; unrun rules are unknown, not passed.`);
  const known = criteria.filter(c => c.final !== null);
  const layer3Total = status === 'complete' && known.length === criteria.length ? known.reduce((s, c) => s + c.final!, 0) : null;
  const gateFailure = gates.some(g => g.verdict === 'fail' && g.verified);
  if (gates.some(g => g.verdict === 'fail' && !g.verified)) unresolved.push('A gate rule fired in an unattested detector result; it is reported but does not affect the total.');
  // Gates flag (capApplied) but never reduce totals — same decision as quality.ts.
  const capApplied = quality.capApplied || gateFailure;
  const cappedTotal = layer3Total;
  const pendingAdvisoryPoints = criteria.reduce((s, c) => s + c.pendingAdvisoryPoints, 0);
  if (pendingAdvisoryPoints) unresolved.push(`${pendingAdvisoryPoints} advisory point(s) await adjudication of whether the pattern is deliberate; totals are provisional.`);
  return {
    registryVersion: registry.version, status,
    runs: runs.map(r => ({ source: r.source, version: r.version, covered: r.coveredRuleIds.length, occurrences: r.occurrences.length, unmapped: r.unmapped, note: r.note })),
    coverage: { covered: covered.size, total: registry.rules.length, unrunRuleIds: registry.rules.filter(r => !covered.has(r.id)).map(r => r.id) },
    deductions, gates, aiTellFlags, originalityCapApplied, criteria,
    observedSubtotal: known.length ? known.reduce((s, c) => s + c.final!, 0) : null, layer3Total,
    capApplied, cap: policy.gateCap, cappedTotal, band: cappedTotal === null ? null : rubric.combined?.bands.find(b => cappedTotal >= b.min && cappedTotal <= b.max)?.label ?? null,
    provisional: pendingAdvisoryPoints > 0, pendingAdvisoryPoints, unresolved,
    review: review(quality, gates, deductions, suggestions, strengths, criteria),
  };
}

// Top three fixes, P0 (blocking) to P3 (polish), plus strengths to keep.
function review(quality: QualitySummary, gates: GateResult[], deductions: Deduction[], suggestions: Suggestion[], strengths: string[], criteria: CriterionLedger[]): Layer3Summary['review'] {
  const items: ReviewItem[] = [];
  for (const d of quality.dealBreakers.filter(d => d.verified && d.verdict === 'fail')) items.push({ priority: 'P0', criterion: null, source: 'deal-breaker', label: `Fix deal-breaker ${d.id}`, detail: 'Verified failure caps the total at the proposed 49.' });
  // The low-contrast gate and the measured contrast deal-breakers describe one defect: list it once.
  const contrastListed = quality.dealBreakers.some(d => d.verified && d.verdict === 'fail' && ['BODY_CONTRAST', 'LARGE_TEXT_CONTRAST'].includes(d.id));
  for (const g of gates.filter(g => g.verified && g.verdict === 'fail' && !(contrastListed && g.ruleId === 'low-contrast-text'))) items.push({ priority: 'P0', criterion: null, source: 'gate', label: `Fix ${g.title.toLowerCase()}`, detail: g.snippet ?? 'Verified gate failure caps the total.' });
  const byCriterion = (id: string) => quality.criteria.find(c => c.id === id);
  for (const s of suggestions) {
    const c = byCriterion(s.criterionId.replace(/-POINTS$/, ''));
    const zero = c?.points === 0;
    items.push({ priority: zero ? 'P1' : s.priority === 'high' ? 'P1' : s.priority === 'medium' ? 'P2' : 'P3', criterion: c?.id ?? null, source: 'criterion', label: s.label, detail: s.change, suggestionId: s.id });
  }
  for (const d of deductions.filter(d => d.status === 'applied' || d.status === 'pending_adjudication')) items.push({ priority: d.severity === 'flag' ? 'P2' : 'P3', criterion: d.criterion, source: 'detector', label: `Remove: ${d.title}`, detail: `${d.status === 'applied' ? `Costs ${d.points} point(s)` : 'Awaiting adjudication'} under ${d.criterion}.` });
  const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const seen = new Set<string>();
  const topFixes = items.sort((a, b) => order[a.priority] - order[b.priority]).filter(i => { const key = i.criterion ?? i.label; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  const preserve = [...strengths, ...criteria.filter(c => c.final !== null && c.final === c.max).map(c => `${c.title}: full points in this run.`)].slice(0, 5);
  return { topFixes, preserve };
}
