import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppError, type Capture, type Profile, type Result, type Rubric, type Suggestion, type Viewport } from '../domain.ts';

export const states = ['default', 'empty', 'loading', 'partial', 'error', 'success'] as const;
export type TaskState = typeof states[number];
export const evidenceKinds = ['screenshot', 'dom', 'styles', 'text', 'runtime', 'recording'] as const;
export type EvidenceKind = typeof evidenceKinds[number];
export type Coverage = 'present' | 'partial' | 'verified_missing_needed' | 'not_applicable' | 'unknown';
const sourceSchema = z.object({ source: z.string().min(1), revision: z.string().min(1) });
export const registrySchema = z.object({
 version: z.string().min(1), status: z.literal('calibration-candidate'), sourceRevision: sourceSchema,
 checks: z.array(z.object({
  id: z.string().min(1), version: z.string().min(1), primaryCriterion: z.string().min(1), description: z.string().min(1),
  applicability: z.object({ kind: z.enum(['all','controls','forms','results','password-login']), states: z.array(z.enum(states)).min(1) }),
  requiredEvidence: z.array(z.enum(evidenceKinds)).min(1),
  verifier: z.enum(['text-size','dom-overflow','visual-judgment','runtime-assertion','temporal-review']), issueFamilyId: z.string().min(1),
  allowedExceptions: z.array(z.object({ id: z.string().min(1), reason: z.string().min(1), requiredEvidence: z.array(z.enum(evidenceKinds)).min(1) })),
  sourceRevision: sourceSchema, severity: z.enum(['critical','high','medium','low']), fix: z.string().min(1),
 })).min(1),
}).superRefine((r, ctx) => {
 if (new Set(r.checks.map(c=>c.id)).size !== r.checks.length) ctx.addIssue({code:'custom',message:'Check IDs must be unique.'});
 for(const c of r.checks) if(new Set(c.allowedExceptions.map(e=>e.id)).size!==c.allowedExceptions.length)ctx.addIssue({code:'custom',message:'Exception IDs must be unique per check.'});
});
export type CheckRegistry = z.infer<typeof registrySchema>;
export type Check = CheckRegistry['checks'][number];
export function loadCheckRegistry(rubric: Rubric, path = process.env.BETTER_CHECK_REGISTRY_PATH || 'config/check-registry.json'): CheckRegistry {
 const registry=registrySchema.parse(JSON.parse(readFileSync(resolve(path),'utf8')));
 if(registry.checks.some(c=>!rubric.axes.some(a=>a.id===c.primaryCriterion)))throw new AppError('Registry references an unknown primary criterion.');
 return registry;
}
export interface TaskStep { id: string; goal: string; intendedOutcome: string }
export interface EvidenceRecord { id: string; kind: EvidenceKind; viewport: Viewport; state: TaskState; taskStep: string }
export interface CheckObservation {
 checkId: string; taskStep: string; viewport: Viewport; state: TaskState; subjectId: string;
 applicable: boolean | null; coverage: Coverage; verdict: 'pass'|'fail'|'unknown'; reason: string;
 evidenceIds: string[]; verifier: string; verified: boolean; provenance: Result['provenance'];
 exceptionId?: string; exceptionReason?: string; underlyingDefectId?: string;
}
export interface LedgerEntry extends CheckObservation { requiredEvidence: EvidenceKind[]; missingEvidence: EvidenceKind[]; exceptionStatus: 'none'|'applied'|'pending'|'rejected' }
export interface Finding {
 id: string; checkId: string; primaryCriterion: string; issueFamilyId: string; taskStep: string; viewport: Viewport; state: TaskState;
 subjectId: string; penaltyKey: string; evidenceIds: string[]; verifier: string; coverageStatus: Coverage;
 severity: 'critical'|'high'|'medium'|'low'; confidence: number|null; kind: 'defect'|'strength'|'preference';
 basis: 'appearance'|'inspectable'|'operation'|'temporal'|'taste'; verified: boolean; provenance: Result['provenance'];
 observedImpact: string; hypothesizedImpact: string|null; concreteFix: string|null;
 exceptionStatus: LedgerEntry['exceptionStatus']; exceptionReason: string|null; suggestionId?: string; conflictsWith?: string[];
}
export interface Reconciliation {
 penaltyKey: string; findingIds: string[]; relation: 'aligned'|'complementary'|'conflicting';
 primaryCriterion: string|null; penaltyEligible: boolean; resolution: 'one_defect'|'supporting_only'|'human_review'|'verified_failure_retained'; review: string|null;
}
export interface Assessment {
 registry: CheckRegistry; taskSteps: TaskStep[]; ledger: LedgerEntry[];
 stateCoverage: { taskStep: string; viewport: Viewport; state: TaskState; applicability: boolean|null; coverage: Coverage; reason: string; evidenceIds: string[]; requiredEvidence: EvidenceKind[] }[];
 findings: Finding[]; reconciliations: Reconciliation[];
 strengths: { text: string; evidenceIds: string[]; findingId: string }[];
 scoreHolds: { criterion: string; viewport: Viewport; reason: string }[];
}
export function taskSteps(profile: Profile): TaskStep[] { return profile.taskSteps?.length ? profile.taskSteps : [{id:'core',goal:profile.task,intendedOutcome:profile.task}]; }

// Evidence is supplied by connected verifiers, not by arbitrary API claims.
// A screenshot can never turn an absent feature into verified missing-and-needed.
export function validateObservation(check: Check, observation: CheckObservation, evidence: EvidenceRecord[]): LedgerEntry {
 if(observation.checkId!==check.id||!check.applicability.states.includes(observation.state))throw new AppError('Observation does not match the check or applicable state.');
 const records=evidence.filter(e=>observation.evidenceIds.includes(e.id)&&e.viewport===observation.viewport&&e.state===observation.state&&e.taskStep===observation.taskStep);
 const supplied=new Set(records.map(e=>e.kind));
 const missing=check.requiredEvidence.filter(k=>!supplied.has(k));
 const ids=records.map(e=>e.id);
 const base={...observation,evidenceIds:ids,requiredEvidence:check.requiredEvidence,missingEvidence:missing,exceptionStatus:'none' as LedgerEntry['exceptionStatus']};
 if(observation.exceptionId){
  const exception=check.allowedExceptions.find(e=>e.id===observation.exceptionId);
  const established=exception&&observation.verified&&observation.verifier===check.verifier&&ids.length===new Set(observation.evidenceIds).size&&observation.exceptionReason?.trim()&&exception.requiredEvidence.every(k=>supplied.has(k));
  if(established)return {...base,applicable:false,coverage:'not_applicable',verdict:'unknown',exceptionStatus:'applied',reason:observation.exceptionReason!};
  return {...base,coverage:ids.length?'partial':'unknown',verdict:'unknown',verified:false,exceptionStatus:exception?'pending':'rejected',reason:'Exception not established; required evidence or allowed exception is missing.'};
 }
 if(observation.coverage==='not_applicable'){
  if(observation.applicable===false&&observation.verified&&observation.verifier===check.verifier&&ids.length===new Set(observation.evidenceIds).size&&observation.reason.trim()&&supplied.has('runtime'))return {...base,verdict:'unknown'};
  return {...base,applicable:null,coverage:'unknown',verdict:'unknown',verified:false,reason:'Non-applicability needs a reason and verified context; a still is insufficient.'};
 }
 const verified=observation.verified&&observation.verifier===check.verifier&&!missing.length&&ids.length===new Set(observation.evidenceIds).size;
 if(observation.coverage==='verified_missing_needed'&&(!verified||observation.applicable!==true||!supplied.has('runtime')))
  return {...base,coverage:ids.length?'partial':'unknown',verdict:'unknown',verified:false,reason:'Missing-and-needed is unverified: establish applicability and absence with runtime evidence.'};
 if(!['present','verified_missing_needed'].includes(observation.coverage))return {...base,verdict:'unknown',verified:false};
 if(observation.coverage==='verified_missing_needed'&&observation.verdict!=='fail')return {...base,coverage:'unknown',verdict:'unknown',verified:false};
 if(!verified||observation.applicable!==true)return {...base,coverage:ids.length?'partial':'unknown',verdict:'unknown',verified:false};
 return {...base,verified:true};
}
export function reconcileFindings(findings: Finding[]): Reconciliation[] {
 const groups=new Map<string,Finding[]>();
 for(const finding of findings)groups.set(finding.penaltyKey,[...(groups.get(finding.penaltyKey)||[]),finding]);
 return [...groups].map(([penaltyKey,group])=>{
  const homes=new Set(group.map(f=>f.primaryCriterion));
  const conflict=homes.size>1||group.some(a=>group.some(b=>a!==b&&(a.state===b.state&&a.kind!==b.kind||a.conflictsWith?.some(id=>id===b.id||id===b.suggestionId))));
  const verifiedFailure=group.some(f=>f.kind==='defect'&&f.verified&&f.basis!=='taste'&&f.exceptionStatus!=='applied');
  const eligible=group.some(f=>f.kind==='defect'&&f.coverageStatus!=='unknown'&&f.exceptionStatus==='none');
  return {penaltyKey,findingIds:group.map(f=>f.id),primaryCriterion:homes.size===1?group[0].primaryCriterion:null,
   relation:conflict?'conflicting':new Set(group.map(f=>`${f.kind}:${f.basis}:${f.state}`)).size>1?'complementary':'aligned',
   penaltyEligible:eligible&&!conflict,resolution:conflict?(verifiedFailure?'verified_failure_retained':'human_review'):eligible?'one_defect':'supporting_only',
   review:conflict?'Keep both observations for human review. Verified task/accessibility failures take precedence over taste; no additional deduction is inferred.':null};
 });
}
const resultCheck: Record<string,string>={'TYPE-01':'text-size','LAY-01':'page-overflow','ORIGINALITY-POINTS':'product-specificity'};
export function buildAssessment(registry: CheckRegistry, profile: Profile, captures: Capture[], results: Result[], suggestions: Suggestion[], extraEvidence: EvidenceRecord[]=[], observations: CheckObservation[]=[]): Assessment {
 const steps=taskSteps(profile);
 const evidence:EvidenceRecord[]=[...extraEvidence,...captures.flatMap(c=>c.artifacts.filter(a=>['screenshot','dom','styles','text'].includes(a.kind)).flatMap(a=>steps.map(step=>({id:a.id,kind:a.kind as EvidenceKind,viewport:c.viewport,state:'default' as const,taskStep:step.id}))))];
 const automatic:CheckObservation[]=[];
 for(const result of results){
  const check=registry.checks.find(c=>c.id===resultCheck[result.criterionId]);if(!check||result.status!=='assessed')continue;
  const failed=!!result.findingId;
  automatic.push({checkId:check.id,taskStep:steps[0].id,viewport:result.viewport,state:'default',subjectId:'page',applicable:true,coverage:'present',verdict:failed?'fail':'pass',reason:result.reason,evidenceIds:result.evidenceIds,verifier:check.verifier,verified:result.provenance!=='unsupported',provenance:result.provenance});
 }
 const ledger:LedgerEntry[]=[];
 for(const step of steps)for(const viewport of ['desktop','mobile'] as const)for(const check of registry.checks)for(const state of check.applicability.states){
  const supplied=[...observations,...automatic].filter(o=>o.checkId===check.id&&o.taskStep===step.id&&o.viewport===viewport&&o.state===state);
  if(new Set(supplied.map(o=>o.subjectId)).size!==supplied.length)throw new AppError('Duplicate check observation for the same subject.');
  const available=evidence.filter(e=>e.taskStep===step.id&&e.viewport===viewport&&e.state===state&&check.requiredEvidence.includes(e.kind));
  const capture=captures.find(c=>c.viewport===viewport);
  const applicable=state==='default'&&(check.applicability.kind==='all'||check.applicability.kind==='controls'&&capture?.facts.elements.some(e=>['button','input','select','a'].includes(e.tag)))?true:null;
  const base:CheckObservation=supplied[0]??{checkId:check.id,taskStep:step.id,viewport,state,subjectId:'page',applicable,coverage:available.length?'partial':'unknown',verdict:'unknown',reason:state!=='default'?'State not observed; no requirement to manufacture it.':'Check-specific verifier or applicability is not established.',evidenceIds:available.map(e=>e.id),verifier:check.verifier,verified:false,provenance:'unsupported'};
  for(const entry of supplied.length?supplied:[base])ledger.push(validateObservation(check,entry,evidence));
 }
 const findings:Finding[]=[];
 for(const entry of ledger){
  if(entry.verdict==='unknown'||entry.coverage==='not_applicable')continue;
  const check=registry.checks.find(c=>c.id===entry.checkId)!;
  const suggestion=suggestions.find(s=>s.viewport===entry.viewport&&resultCheck[s.criterionId]===entry.checkId);
  const basis=check.verifier==='visual-judgment'?'appearance':check.verifier==='runtime-assertion'?'operation':check.verifier==='temporal-review'?'temporal':'inspectable';
  findings.push({id:`${entry.viewport}:${entry.taskStep}:${entry.state}:${check.id}:${entry.subjectId}`,checkId:check.id,primaryCriterion:check.primaryCriterion,issueFamilyId:check.issueFamilyId,taskStep:entry.taskStep,viewport:entry.viewport,state:entry.state,subjectId:entry.subjectId,penaltyKey:`${entry.viewport}:${entry.taskStep}:${entry.underlyingDefectId??`${check.issueFamilyId}:${entry.subjectId}`}`,evidenceIds:entry.evidenceIds,verifier:entry.verifier,coverageStatus:entry.coverage,severity:check.severity,confidence:null,kind:entry.verdict==='fail'?'defect':'strength',basis,verified:entry.verified&&entry.provenance==='measured',provenance:entry.provenance,observedImpact:entry.reason,hypothesizedImpact:null,concreteFix:entry.verdict==='fail'?check.fix:null,exceptionStatus:entry.exceptionStatus,exceptionReason:entry.exceptionReason??null,suggestionId:suggestion?.id});
 }
 // Preserve every original visual finding independently; no accumulated detector counts were supplied to its judge.
 for(const suggestion of suggestions.filter(s=>!findings.some(f=>f.suggestionId===s.id))){
  const result=results.find(r=>r.criterionId===suggestion.criterionId&&r.viewport===suggestion.viewport)!;
  const family=result.issueId??suggestion.issueKey.split(':')[1];
  findings.push({id:suggestion.id,checkId:suggestion.criterionId,primaryCriterion:result.axis??'unscored',issueFamilyId:family,taskStep:steps[0].id,viewport:suggestion.viewport,state:'default',subjectId:'page',penaltyKey:`${suggestion.viewport}:${steps[0].id}:${family}:page`,evidenceIds:suggestion.evidenceIds,verifier:result.provenance==='measured'?'inspectable-facts':'visual-judgment',coverageStatus:'present',severity:suggestion.priority,confidence:result.confidence,kind:'defect',basis:result.provenance==='measured'?'inspectable':result.channel==='taste'?'taste':'appearance',verified:result.provenance==='measured',provenance:result.provenance,observedImpact:result.provenance==='measured'?result.reason:'Visual interpretation, not verified operation.',hypothesizedImpact:suggestion.problem,concreteFix:suggestion.change,exceptionStatus:'none',exceptionReason:null,suggestionId:suggestion.id,conflictsWith:suggestion.conflicts.map(id=>`${suggestion.id.split(':')[0]}:${suggestion.viewport}:${id}`)});
 }
 const reconciliations=reconcileFindings(findings);
 const strengths=findings.filter(f=>f.kind==='strength'&&f.verified&&!findings.some(d=>d.penaltyKey===f.penaltyKey&&d.kind==='defect')).slice(0,3).map(f=>({text:f.observedImpact,evidenceIds:f.evidenceIds,findingId:f.id}));
 const scoreHolds:Assessment['scoreHolds']=[];
 for(const f of findings.filter(f=>f.kind==='defect'&&f.verified)){
  const point=results.find(r=>r.viewport===f.viewport&&r.axis===f.primaryCriterion&&r.criterionId.endsWith('-POINTS'));
  // A verified failing check contradicts the unchanged full-points anchor (passes every check).
  if(point?.status==='assessed'&&!point.findingId)scoreHolds.push({criterion:f.primaryCriterion,viewport:f.viewport,reason:'Full points conflict with a verified supporting failure; human review required.'});
 }
 return {registry,taskSteps:steps,ledger,findings,reconciliations,strengths,scoreHolds,stateCoverage:steps.flatMap(step=>(['desktop','mobile'] as const).flatMap(viewport=>states.map(state=>{
  const records=evidence.filter(e=>e.taskStep===step.id&&e.viewport===viewport&&e.state===state);
  const observed=records.some(e=>state==='default'?e.kind==='screenshot':e.kind==='runtime');
  return {taskStep:step.id,viewport,state,applicability:observed?true:null,coverage:observed?'present' as const:'unknown' as const,reason:observed?'Observed state evidence; individual checks may remain incomplete.':'State applicability and evidence unknown; do not manufacture it.',evidenceIds:records.map(e=>e.id),requiredEvidence:state==='default'?['screenshot' as const]:['runtime' as const]};
 })))};
}
export function reconciledScores(results: Result[], assessment: Assessment): Result[] {
 return results.map(r=>assessment.scoreHolds.some(h=>h.criterion===r.axis&&h.viewport===r.viewport)&&r.criterionId.endsWith('-POINTS')?{...r,status:'not_assessed',score:null,findingId:null,reason:'Unresolved conflict with verified failure; original judgment retained in results.'}:r);
}

export function groundedSuggestions(suggestions: Suggestion[], assessment: Assessment): Suggestion[] {
 const seen=new Set<string>();
 return suggestions.filter(s=>{const f=assessment.findings.find(f=>f.suggestionId===s.id);if(!f||f.kind!=='defect'||f.exceptionStatus==='applied'||seen.has(f.penaltyKey))return false;seen.add(f.penaltyKey);return true;});
}
