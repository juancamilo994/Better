import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { loadRubric, hash } from '../src/config.ts';
import { buildAssessment, loadCheckRegistry, type CheckObservation, type EvidenceRecord, type TaskState } from '../src/evaluation/evidence.ts';
import type { Profile } from '../src/domain.ts';
const directory=resolve('fixtures/benchmark'), output=resolve('test-results/benchmark');await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
assert.equal(manifest.status,'authored-calibration-candidates-not-validated-ground-truth');
const registry=loadCheckRegistry(loadRubric());
const profile:Profile={version:'benchmark-1',task:'Complete the explicitly described fixture task',audience:'People completing the fixture task',feeling:'Clear and capable',taste:'',avoid:'',brand:''};
const browser=await chromium.launch({headless:true});
const reports:unknown[]=[];
try{
 for(const candidate of manifest.cases){
  const page=await browser.newPage({viewport:{width:360,height:900}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(await readFile(join(directory,candidate.id+'.html'),'utf8'));
  const records:EvidenceRecord[]=[],observations:CheckObservation[]=[],artifacts:{id:string;file:string;sha256:string}[]=[];
  async function record(state:TaskState,kind:EvidenceRecord['kind'],data:unknown){
   const id=`${candidate.id}:${records.length}:${kind}`,file=`${candidate.id}-${records.length}.${kind==='screenshot'?'png':'json'}`;
   const facts=kind==='dom'?await page.content():kind==='text'?await page.locator('body').innerText():kind==='styles'?await page.locator('section, [data-essential], input, button').evaluateAll(elements=>elements.map(e=>({tag:e.tagName,id:e.id,text:e.textContent?.slice(0,300),width:e.clientWidth,scrollWidth:e.scrollWidth,fontSize:getComputedStyle(e).fontSize,overflow:getComputedStyle(e).overflow,overflowWrap:getComputedStyle(e).overflowWrap}))):undefined;
   const bytes=kind==='screenshot'?await page.screenshot({fullPage:true}):Buffer.from(JSON.stringify({candidate:manifest.status,state,kind,observation:data,facts}));
   await writeFile(join(output,file),bytes);records.push({id,kind,state,taskStep:'core',viewport:'mobile'});artifacts.push({id,file,sha256:hash(bytes)});return id;
  }
  async function observe(checkId:string,state:TaskState,subjectId:string,pass:boolean,reason:string,exceptionId?:string){
   const check=registry.checks.find(c=>c.id===checkId)!;const ids:string[]=[];
   for(const kind of check.requiredEvidence)ids.push(await record(state,kind,{subjectId,pass,reason}));
   observations.push({checkId,taskStep:'core',viewport:'mobile',state,subjectId,applicable:true,coverage:'present',verdict:pass?'pass':'fail',reason,evidenceIds:ids,verifier:check.verifier,verified:true,provenance:'measured',exceptionId,exceptionReason:exceptionId?reason:undefined});
  }
  await record('default','screenshot',{appearanceOnly:true});
  if(candidate.id==='text-disclosure'){
   const clipped=await page.locator('#bad [data-essential]').evaluate(e=>e.scrollWidth>e.clientWidth&&getComputedStyle(e).overflowX==='hidden');assert.equal(clipped,true);
   await observe(candidate.check,'default','clipped-text',false,'Essential cancellation text is horizontally clipped in this authored fixture.');
   const summary=page.locator('#good summary');await summary.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#good [data-essential]').isVisible(),true);
   await observe(candidate.check,'default','disclosure-text',true,'Keyboard activation exposes the essential cancellation conditions.');
  }else if(candidate.id==='long-content'){
   await page.addStyleTag({content:'body{font-size:36px}'});
   const overflow=async(id:string)=>page.locator('#'+id).evaluate(e=>e.scrollWidth>e.clientWidth+1);
   assert.equal(await overflow('bad'),true);assert.equal(await overflow('good'),false);
   await observe(candidate.check,'default','long-bad',false,'Long name/URL overflows at 360px and 200% authored text size.');
   await observe(candidate.check,'default','long-good',true,'Long name/URL wraps within its container at 360px and 200% authored text size.');
  }else if(candidate.id==='branding'){
   await record('default','text',{audience:'Touring cyclists',feeling:'Capable and practical',coreJob:'Find a bicycle repair kit'});
   // No pattern-count oracle or invented good/bad visual score.
  }else if(candidate.id==='control-operation'){
   for(const id of ['bad','good']){
    await page.locator('#'+id+' button').focus();await page.keyboard.press('Enter');
    const outcome=await page.locator('#'+id+' [role=status]').textContent();assert.equal(outcome,id==='good'?'Booking saved':'Not saved');
    await observe(candidate.check,'default',id,outcome==='Booking saved',`Keyboard activation resulted in ${JSON.stringify(outcome)} in the fixture.`);
    await observe('task-meaning','default',id,outcome==='Booking saved',`Expected outcome Booking saved; observed ${JSON.stringify(outcome)}.`);
   }
   await page.locator('#passwordless input').fill('rider@example.test');await page.locator('#passwordless button').click();
   assert.equal(await page.locator('#passwordless [role=status]').textContent(),'Sign-in link sent');assert.equal(await page.locator('#passwordless input[type=password]').count(),0);
   await observe('password-login','default','passwordless',true,'Authored email-link flow confirms a sent link without a password field; password-specific recovery is not needed.','passwordless');
  }else if(candidate.id==='error-recovery'){
   for(const id of ['bad','good']){
    await page.locator('#'+id+' input').fill('Alexandria');await page.locator('#'+id+' button').first().click();
    const value=await page.locator('#'+id+' input').inputValue();assert.equal(value,id==='good'?'Alexandria':'');
    await observe(candidate.check,'error',id,value==='Alexandria',`After fixture error, entered value is ${JSON.stringify(value)}.`);
   }
   await page.getByRole('button',{name:'Choose available date'}).click();assert.equal(await page.locator('#good [role=status]').textContent(),'Reservation confirmed');assert.equal(await page.locator('#good input').inputValue(),'Alexandria');
   await observe(candidate.check,'success','good',true,'Corrected fixture reservation succeeds and keeps the entered name.');
   await observe('task-progress','success','good',true,'Reservation confirmed is visible after correction.');
  }else if(candidate.id==='partial-results'){
   assert.equal(await page.locator('#state').textContent(),'No results yet');await record('empty','runtime',{status:'No results yet'});
   await page.locator('#start').click();assert.equal(await page.locator('#state').textContent(),'Loading results');await record('loading','runtime',{status:'Loading results'});
   await page.locator('#finish').click();assert.equal(await page.locator('#results').isVisible(),true);
   for(const id of ['bad','good']){
    const usable=await page.locator('#'+id+' button').isEnabled();assert.equal(usable,id==='good');
    if(usable){await page.locator('#'+id+' button').click();assert.equal(await page.locator('#'+id+' [role=status]').textContent(),'Workshop opened');}
    await observe(candidate.check,'partial',id,usable,`One fixture component failed; another result action is ${usable?'usable':'disabled'}.`);
   }
  }
  // Multiple subjects under the same check/state remain distinct findings.
  const assessments=[buildAssessment(registry,profile,[],[],[],records,observations)];
  for(const o of observations){const row=assessments.find(a=>a.ledger.some(l=>l.checkId===o.checkId&&l.subjectId===o.subjectId&&l.state===o.state&&(o.exceptionId?l.exceptionStatus==='applied':l.verdict===o.verdict)));assert.ok(row,`Missing grounded observation for ${candidate.id}/${o.subjectId}`);}
  if(candidate.id==='branding')assert.ok(assessments[0].ledger.filter(l=>l.checkId==='product-specificity').every(l=>l.verdict==='unknown'));
  await page.screenshot({path:join(output,candidate.id+'-result.png'),fullPage:true});assert.deepEqual(errors,[]);
  reports.push({candidate,profile,artifacts,assessments});await page.close();
 }
 await writeFile(join(output,'report.json'),JSON.stringify({version:manifest.version,status:manifest.status,liveInference:false,results:reports},null,2));
 console.log(`PASS: six authored calibration candidates, real Chromium assertions, passwordless applicability, unknown visual judgment and saved evidence: ${output}`);
}finally{await browser.close();}
