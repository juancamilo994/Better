import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRubric } from '../src/config.ts';
import { rubricSchema, type DealBreakerObservation, type Result } from '../src/domain.ts';
import { combinedQuality } from '../src/evaluation/quality.ts';
import { profile, capture } from './helpers.ts';
import { missingEvidence } from '../src/evaluation/checks.ts';
import { buildRequest, parseResponse } from '../src/judges/subq.ts';
import { validateDecision } from '../src/judges/interface.ts';
const rubric = loadRubric();
// Synthetic policy proves configurability separately from the source defaults.
function configured() {
 const r = structuredClone(rubric);
 r.combined!.unresolved = [];
 r.combined!.issueCatalog = []; // arithmetic tests isolate policy from provider issue attribution

 r.combined!.bands = [{ min: 0, max: 49, label: 'test-low' }, { min: 50, max: 100, label: 'test-high' }];
 for (const c of r.criteria.filter(c => c.role === 'points')) { const max = r.axes.find(a => a.id === c.axis)!.weight!; c.scoreValues = [0, max/2, max]; c.anchors = ['test obstacle', 'test partial', 'test strong']; }
 return r;
}
function results(): Result[] { return configured().criteria.filter(c=>c.role==='points').map(c=>({ criterionId:c.id, axis:c.axis, viewport:'desktop', channel:'quality', status:'assessed', score:configured().axes.find(a=>a.id===c.axis)!.weight!, provenance:'subq', reason:'Synthetic test only', findingId:null, confidence:null, evidenceIds:['test:desktop:screenshot'] })); }
const failure: DealBreakerObservation = { id:'FEEDBACK_DELAY', applicable:true, verdict:'fail', verified:true, evidenceIds:['test:runtime:trace'], evidenceKind:'runtime' };
test('ten proposed weights total 100; wrong sum and duplicate scoring homes are rejected',()=>{
 assert.equal(rubric.axes.length,10); assert.deepEqual(rubric.axes.map(a=>a.weight),[12,12,10,12,12,10,10,8,6,8]);
 const bad=structuredClone(rubric);bad.axes[0].weight=13;assert.equal(rubricSchema.safeParse(bad).success,false);
 const duplicate=structuredClone(rubric);duplicate.criteria.push(structuredClone(duplicate.criteria[0]));assert.equal(rubricSchema.safeParse(duplicate).success,false);
});
test('verified applicable runtime failure caps at 49 while preserving raw total and points',()=>{
 const q=combinedQuality(configured(),results(),'desktop',[failure]);assert.equal(q.rawTotal,100);assert.equal(q.cappedTotal,49);assert.equal(q.capApplied,true);assert.equal(q.criteria[0].points,12);assert.equal(q.band,'test-low');
 const changed=configured();changed.combined!.cap=30;assert.equal(combinedQuality(changed,results(),'desktop',[failure]).cappedTotal,30);
 for(const observation of [{...failure,applicable:false},{...failure,applicable:null},{...failure,verified:false},{...failure,evidenceIds:[]},{...failure,evidenceKind:'static' as const},{...failure,verdict:'unknown' as const},{...failure,verdict:'pass' as const}])assert.equal(combinedQuality(configured(),results(),'desktop',[observation]).capApplied,false);
});
test('unknown points remain null; no prorating, invented zero or complete total',()=>{
 const values=results().slice(1);const q=combinedQuality(configured(),values,'desktop',[failure]);assert.equal(q.criteria[0].points,null);assert.equal(q.coverage.assessedWeight,88);assert.equal(q.observedSubtotal,88);assert.equal(q.rawTotal,null);assert.equal(q.cappedTotal,null);assert.equal(q.band,null);assert.equal(q.capApplied,true);
 const none=combinedQuality(configured(),[],'desktop');assert.equal(none.observedSubtotal,null);assert.equal(none.dealBreakers[0].verdict,'unknown');assert.equal(none.dealBreakers[0].verified,false);
 const unknown=results();unknown[0].status='not_assessed';unknown[0].score=null;assert.equal(combinedQuality(configured(),unknown,'desktop').rawTotal,null);
});
test('bands follow configured boundaries and source defaults',()=>{
 const values=results();values.forEach(v=>v.score=0);assert.equal(combinedQuality(configured(),values,'desktop').band,'test-low');
 assert.equal(combinedQuality(configured(),results(),'desktop').band,'test-high');
 assert.equal(combinedQuality(rubric,[],'desktop').band,null);assert.equal(rubric.combined!.bands.length,5);
 const bad=configured();bad.combined!.bands[1].min=49;assert.equal(rubricSchema.safeParse(bad).success,false);
});
test('duplicate penalty results and overlapping issue identities fail closed; supporting checks add no points',()=>{
 const values=results();assert.throws(()=>combinedQuality(configured(),[...values,values[0]],'desktop'),/Duplicate/);
 values[0].issueId=values[1].issueId='same-observed-issue';assert.throws(()=>combinedQuality(configured(),values,'desktop'),/penalty home/);
 const supporting={...results()[0],criterionId:'TYPE-01',score:1};assert.equal(combinedQuality(configured(),[...results(),supporting],'desktop').rawTotal,100);
 assert.equal(rubric.axes.some(a=>a.id==='AIS'),false);assert.match(rubric.criteria.find(c=>c.axis==='ORIGINALITY')!.instructions,/AI-isms/);
});
test('proposed feedback target and deal-breaker threshold stay distinct and require runtime',()=>{
 assert.equal(rubric.combined!.feedbackTargetMs,100);assert.equal(rubric.combined!.feedbackDealBreakerMs,400);assert.equal(rubric.combined!.status,'proposed');
 assert.equal(rubric.combined!.dealBreakers.find(d=>d.id==='FEEDBACK_DELAY')!.requires,'runtime');assert.equal(rubric.combined!.pairwise.enabled,false);
 assert.match(missingEvidence(rubric.criteria.find(c=>c.id==='INT-02')!,capture(),capture('mobile'),profile)!,/Static inputs/);
});
test('new scoring uses configured point choices including zero rather than canonical 1–4',()=>{
 const c=configured().criteria[0];const input={criterion:c,capture:capture(),profile,source:'controlled_demo' as const,demoVersion:'baseline' as const,images:[{evidenceId:'test:desktop:screenshot',mediaType:'image/png' as const,base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}]};
 const body=buildRequest(input,'test');assert.deepEqual(Object.keys(body.questions.rating.criteria),['0','6','12','not_assessed']);
 const answer=(choice:string,options:string[])=>({type:'choice',choice,confidence:.8,probabilities:Object.fromEntries(options.map(o=>[o,o===choice?1:0]))});
 const raw={model:'test',usage:{input_tokens:1,output_tokens:0},answers:{rating:answer('0',['0','6','12','not_assessed']),finding:answer('none',['none',c.findings[0].id]),evidence:answer('test:desktop:screenshot',['none','test:desktop:screenshot'])}};
 const parsed=parseResponse(raw,input,'test');assert.equal(parsed.score,0);assert.equal(validateDecision(parsed,input,{version:'test',provenance:'subq',evaluate:async()=>parsed}).score,0);
});

test('source bands, nine gates and required evidence stay explicit',()=>{
 const policy=rubric.combined!;assert.equal(policy.dealBreakers.length,9);
 for(const [score,label] of [[0,4],[39,4],[40,3],[59,3],[60,2],[74,2],[75,1],[89,1],[90,0],[100,0]])assert.equal(policy.bands.find(b=>score>=b.min&&score<=b.max)?.label,policy.bands[label].label);
 assert.match(missingEvidence(rubric.criteria.find(c=>c.id==='TYPOGRAPHY-POINTS')!,capture(),capture('mobile'),profile)!,/measurements/);
 assert.match(missingEvidence(rubric.criteria.find(c=>c.id==='INTERACTION-POINTS')!,capture(),capture('mobile'),profile)!,/Static inputs/);
 const staticClaim={...failure,id:'BODY_CONTRAST'};assert.equal(combinedQuality(configured(),results(),'desktop',[staticClaim]).capApplied,false);
 const measured={...staticClaim,evidenceKind:'measurement' as const};assert.equal(combinedQuality(configured(),results(),'desktop',[measured]).capApplied,true);
});

test('real SubQ parsing wires canonical issue ownership and rejects overlapping penalty homes',()=>{
 const c=rubric.criteria.find(c=>c.id==='ORIGINALITY-POINTS')!;
 const input={criterion:c,capture:capture(),profile,issues:rubric.combined!.issueCatalog,source:'controlled_demo' as const,demoVersion:'baseline' as const,images:[{evidenceId:'test:desktop:screenshot',mediaType:'image/png' as const,base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='}]};
 const request=buildRequest(input,'test');assert.ok(request.questions.issue);
 const answer=(choice:string,options:string[])=>({type:'choice',choice,confidence:.8,probabilities:Object.fromEntries(options.map(o=>[o,o===choice?1:0]))});
 const response=(issue:string)=>({model:'test',usage:{input_tokens:1,output_tokens:0},answers:{rating:answer('0',['0','5','10','not_assessed']),finding:answer(c.findings[0].id,['none',c.findings[0].id]),evidence:answer('test:desktop:screenshot',['none','test:desktop:screenshot']),issue:answer(issue,['none',...input.issues.map(i=>i.id)])}});
 const own=parseResponse(response('TEMPLATE'),input,'test');assert.equal(own.issueId,'TEMPLATE');assert.equal(own.status,'assessed');
 const duplicate=parseResponse(response('HIERARCHY'),input,'test');assert.equal(duplicate.status,'not_assessed');assert.equal(duplicate.score,null);
 const judge={version:'test',provenance:'subq' as const,evaluate:async()=>own};assert.equal(validateDecision(own,input,judge).issueId,'TEMPLATE');
 assert.throws(()=>validateDecision({...own,issueId:'HIERARCHY'},input,judge),/invalid_issue_ownership/);
 const points=results();points[5]={...points[5],score:0,issueId:'HIERARCHY'};assert.throws(()=>combinedQuality(rubric,points,'desktop'),/penalty home/);
});
