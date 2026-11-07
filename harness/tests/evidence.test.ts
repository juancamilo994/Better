import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRubric } from '../src/config.ts';
import { loadCheckRegistry, validateObservation, reconcileFindings, buildAssessment, reconciledScores, type CheckObservation, type EvidenceRecord, type Finding } from '../src/evaluation/evidence.ts';
import { capture, profile, run } from './helpers.ts';
import { assemblePrompt } from '../src/evaluation/explanations.ts';
const registry=loadCheckRegistry(loadRubric());
const check=registry.checks.find(c=>c.id==='control-operation')!;
const observation:CheckObservation={checkId:check.id,taskStep:'core',viewport:'desktop',state:'default',subjectId:'save',applicable:true,coverage:'verified_missing_needed',verdict:'fail',reason:'Expected save outcome did not occur in the bounded fixture.',evidenceIds:['runtime'],verifier:'runtime-assertion',verified:true,provenance:'measured'};
const runtime:EvidenceRecord={id:'runtime',kind:'runtime',taskStep:'core',viewport:'desktop',state:'default'};
function finding(overrides:Partial<Finding>={}):Finding{return {id:'measured',checkId:check.id,primaryCriterion:'INTERACTION',issueFamilyId:'CONTROL_OPERATION',taskStep:'core',viewport:'desktop',state:'default',subjectId:'save',penaltyKey:'desktop:core:CONTROL_OPERATION:save',evidenceIds:['runtime'],verifier:'runtime-assertion',coverageStatus:'present',severity:'high',confidence:null,kind:'defect',basis:'operation',verified:true,provenance:'measured',observedImpact:'Save outcome failed in the fixture.',hypothesizedImpact:null,concreteFix:'Connect the save action and confirm the outcome.',exceptionStatus:'none',exceptionReason:null,...overrides};}
test('curated registry declares versioned ownership, evidence, applicability, verifier, families, exceptions and revisions',()=>{
 assert.equal(registry.checks.length,14);assert.equal(registry.status,'calibration-candidate');
 for(const c of registry.checks){assert.ok(c.version&&c.sourceRevision.revision&&c.verifier&&c.issueFamilyId);assert.ok(c.requiredEvidence.length&&c.applicability.states.length);assert.ok(loadRubric().axes.some(a=>a.id===c.primaryCriterion));}
 assert.equal(registry.checks.find(c=>c.id==='product-specificity')!.primaryCriterion,'ORIGINALITY');
});
test('absence from screenshot cannot establish missing-and-needed; every evidence condition matters',()=>{
 const good=validateObservation(check,observation,[runtime]);assert.equal(good.coverage,'verified_missing_needed');assert.equal(good.verdict,'fail');
 for(const [change,evidence] of [[{applicable:null},[runtime]],[{verified:false},[runtime]],[{verifier:'visual-judgment'},[runtime]],[{evidenceIds:['runtime','nonexistent']},[runtime]],[{},[{...runtime,kind:'screenshot'}]],[{},[{...runtime,state:'error'}]],[{},[]]] as [Partial<CheckObservation>,EvidenceRecord[]][]){const row=validateObservation(check,{...observation,...change},evidence);assert.equal(row.verdict,'unknown');assert.notEqual(row.coverage,'verified_missing_needed');}
 const partial=validateObservation(check,{...observation,coverage:'partial'},[runtime]);assert.equal(partial.verdict,'unknown');
});
test('passwordless alternative establishes non-applicability only with evidence and reason',()=>{
 const c=registry.checks.find(c=>c.id==='password-login')!;
 const claim={...observation,checkId:c.id,exceptionId:'passwordless',exceptionReason:'Fixture sends an email sign-in link without a password.'};
 const valid=validateObservation(c,claim,[runtime]);assert.equal(valid.coverage,'not_applicable');assert.equal(valid.exceptionStatus,'applied');assert.equal(valid.verdict,'unknown');
 for(const modified of [{...claim,exceptionReason:''},{...claim,verified:false},{...claim,verifier:'visual-judgment'},{...claim,evidenceIds:['runtime','nonexistent']},{...claim,exceptionId:'unlisted'}])assert.notEqual(validateObservation(c,modified,[runtime]).coverage,'not_applicable');
 assert.equal(validateObservation(c,claim,[{...runtime,kind:'screenshot'}]).exceptionStatus,'pending');
 assert.equal(validateObservation(c,{...claim,exceptionId:undefined,applicable:false,coverage:'not_applicable',reason:''},[runtime]).coverage,'unknown');
});
test('default state evidence does not manufacture empty/loading/partial/error/success or task completion',()=>{
 const assessment=buildAssessment(registry,{...profile,taskSteps:[{id:'choose',goal:'Choose a workshop',intendedOutcome:'Workshop details open'},{id:'reserve',goal:'Reserve',intendedOutcome:'Reservation confirmed'}]},[capture(),capture('mobile')],[],[]);
 assert.equal(assessment.stateCoverage.length,24);
 assert.equal(assessment.stateCoverage.find(s=>s.state==='default')!.coverage,'present');
 assert.ok(assessment.stateCoverage.filter(s=>s.state!=='default').every(s=>s.coverage==='unknown'&&s.requiredEvidence.includes('runtime')));
 for(const id of ['task-goal','task-next','task-meaning','task-progress'])assert.ok(assessment.ledger.some(e=>e.checkId===id&&e.verdict==='unknown'));
 assert.equal(assessment.ledger.find(e=>e.checkId==='task-goal')!.coverage,'partial');
 assert.equal(assessment.ledger.find(e=>e.checkId==='control-operation')!.coverage,'unknown');
});
test('reconciliation aligns repeated claims, complements different evidence, keeps conflicts and one penalty identity',()=>{
 const a=finding();assert.equal(reconcileFindings([a,finding({id:'repeat'})])[0].relation,'aligned');
 const complementary=reconcileFindings([a,finding({id:'visual',basis:'appearance',verified:false})]);assert.equal(complementary[0].relation,'complementary');assert.equal(complementary.length,1);assert.equal(complementary[0].resolution,'one_defect');
 const conflict=reconcileFindings([a,finding({id:'taste',kind:'preference',basis:'taste',verified:false,concreteFix:'Remove the operation'})])[0];assert.equal(conflict.relation,'conflicting');assert.equal(conflict.resolution,'verified_failure_retained');assert.ok(conflict.review);assert.equal(conflict.penaltyEligible,false);
 assert.equal(reconcileFindings([a,finding({id:'success',state:'success',kind:'strength'})])[0].relation,'complementary');
 const tradeoff=reconcileFindings([finding({verified:false}),finding({id:'other',kind:'preference',basis:'taste',verified:false})])[0];assert.equal(tradeoff.resolution,'human_review');
 assert.equal(reconcileFindings([a,finding({id:'opposing-fix',concreteFix:'Disconnect save',conflictsWith:['measured']})])[0].relation,'conflicting');
 assert.equal(reconcileFindings([a,finding({id:'other-viewport',viewport:'mobile',penaltyKey:'mobile:core:CONTROL_OPERATION:save'})]).length,2);
});
test('verified check failure cannot be overridden by a full-points visual judgment; original result stays intact',()=>{
 const c=capture();const points={criterionId:'USABILITY-POINTS',viewport:'desktop' as const,channel:'quality' as const,axis:'USABILITY',status:'assessed' as const,score:8,provenance:'subq' as const,reason:'Mock visual full points',evidenceIds:[c.artifacts[0].id],findingId:null,confidence:.9};
 const measured={...points,criterionId:'LAY-01',score:1,provenance:'measured' as const,findingId:'HORIZONTAL_OVERFLOW',reason:'Document wider than captured viewport.',evidenceIds:[c.artifacts[1].id]};
 const a=buildAssessment(registry,profile,[c],[points,measured],[]);assert.equal(a.scoreHolds.length,1);assert.equal(reconciledScores([points,measured],a)[0].score,null);assert.equal(points.score,8);
});
test('preserve list is evidence-backed and selected-only prompt rejects unresolved tradeoffs',()=>{
 const r=run();r.assessment=buildAssessment(registry,profile,[capture()],[],[]);r.assessment.strengths=[{text:'Keep the verified accessible disclosure.',evidenceIds:['runtime'],findingId:'strength'}];
 r.suggestions=[{id:'selected',runId:r.id,criterionId:'INT-01',viewport:'desktop',state:'default',issueKey:'desktop:SAVE',label:'Repair save',problem:'Save failed',change:'Connect save',effect:'Hypothesis only',priority:'high',provenance:'measured',evidenceIds:['runtime'],dependencies:[],conflicts:[]},{id:'unselected',runId:r.id,criterionId:'TYPE-01',viewport:'desktop',state:'default',issueKey:'desktop:TYPE',label:'Change text',problem:'Text issue',change:'Change all text',effect:'Hypothesis only',priority:'medium',provenance:'measured',evidenceIds:['dom'],dependencies:[],conflicts:[]}];
 r.assessment.findings=[finding({suggestionId:'selected'}),finding({id:'other',suggestionId:'unselected',penaltyKey:'other'})];r.assessment.reconciliations=reconcileFindings(r.assessment.findings);
 const prompt=assemblePrompt(r,['selected']);assert.match(prompt,/Preserve these/);assert.match(prompt,/verified accessible disclosure/);assert.match(prompt,/Connect save/);assert.doesNotMatch(prompt,/Change all text/);assert.match(prompt,/does not establish conversion or satisfaction/);
 const f=finding({id:'f',suggestionId:'selected',verified:false});r.assessment.findings=[f,finding({id:'tradeoff',kind:'preference',verified:false,basis:'taste'})];r.assessment.reconciliations=reconcileFindings(r.assessment.findings);assert.throws(()=>assemblePrompt(r,['selected']),/human review/);
});

test('connected verifiers can link two checks to one underlying defect without adding a deduction',()=>{
 const observations:CheckObservation[]=[{...observation,coverage:'present',underlyingDefectId:'save-outcome'},{...observation,checkId:'task-meaning',coverage:'present',underlyingDefectId:'save-outcome'}];
 const a=buildAssessment(registry,profile,[],[],[],[runtime],observations);
 assert.equal(a.findings.length,2);assert.equal(a.reconciliations.length,1);
 assert.equal(a.reconciliations[0].relation,'conflicting');assert.equal(a.reconciliations[0].resolution,'verified_failure_retained');
 assert.equal(a.scoreHolds.length,0); // No invented point allocation or extra deduction.
 assert.throws(()=>validateObservation(check,{...observation,checkId:'unrelated'},[runtime]),/does not match/);
 assert.throws(()=>validateObservation(check,{...observation,state:'loading'},[runtime]),/does not match/);
});
