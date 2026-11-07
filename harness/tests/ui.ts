import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../src/store.ts';
import { evaluateProject } from '../src/evaluation/pipeline.ts';
import { SubQJudge } from '../src/judges/subq.ts';
import { DEMO_URL } from '../src/capture/demo.ts';
import { randomUUID } from 'node:crypto';
import type { Run } from '../src/domain.ts';

const state = await mkdtemp(join(tmpdir(), 'better-ui-'));
const output = resolve('test-results');
await mkdir(output, { recursive: true });
const registryPath=join(state,'checks.json');
await writeFile(registryPath,await readFile('config/check-registry.json'));
const server = spawn(process.execPath, ['dist/server.js'], { env: { ...process.env, PORT: '0', BETTER_DATA_DIR: state, BETTER_RUBRIC_PATH: 'config/rubric.json', BETTER_CHECK_REGISTRY_PATH:registryPath, BETTER_JUDGE: 'fixture', BETTER_ALLOW_PAID_CALLS: 'false', SUBQ_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
 const base = await new Promise<string>((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Server startup timeout')), 10000);
  server.once('exit', () => { clearTimeout(timer); reject(new Error('Server exited')); });
  server.stdout!.on('data', bytes => { const line=String(bytes).trim(); if(line.startsWith('Better harness listening on ')){clearTimeout(timer);resolve(line.slice('Better harness listening on '.length));} });
 });
 browser = await chromium.launch({headless:true});
 const page = await browser.newPage({viewport:{width:1440,height:1000}});
 const errors:string[]=[];
 page.on('pageerror', error=>errors.push(error.message));
 page.on('console', message=>{if(message.type()==='error')errors.push(message.text());});
 page.on('requestfailed', request=>errors.push(request.url()+': '+request.failure()?.errorText));
 await page.goto(base); await page.locator('#fingerprint .criterion-label').first().waitFor();
 assert.equal(await page.locator('#fingerprint .criterion-label').count(),10);
 assert.equal(await page.locator('#brief input[required]').count(),4);
 assert.equal(await page.locator('#score-values tr').count(),10);
 assert.equal(await page.locator('#score-values tr').first().locator('td').first().textContent(),'Unknown / 12');
 const disclosure=page.locator('#scores-details > summary');
 await disclosure.hover();assert.match(await disclosure.evaluate(e=>getComputedStyle(e).textDecorationLine),/underline/);
 await disclosure.click();assert.equal(await page.locator('#score-table').isVisible(),true);
 const pointerValues=await page.locator('#score-values').innerText();
 await disclosure.click();await disclosure.focus();await page.keyboard.press('Enter');
 assert.equal(await page.locator('#score-table').isVisible(),true);
 assert.equal(await page.locator('#score-values').innerText(),pointerValues);
 await page.keyboard.press('Space');assert.equal(await page.locator('#score-table').isVisible(),false);
 // Synthetic chart values test rendering only; never saved as evaluation evidence.
 await page.evaluate('chart(rubric.axes,rubric.axes.map((a,i)=>({id:a.id,points:i%2?a.weight:0})));scoreTable(rubric.axes,rubric.axes.map((a,i)=>({id:a.id,points:i%2?a.weight:0})))');
 assert.equal(await page.locator('#score-values tr').first().locator('td').first().textContent(),'0 / 12');
 assert.equal(await page.locator('#score-values tr').nth(1).locator('td').first().textContent(),'12 / 12');
 assert.equal(await page.locator('#fingerprint .point').count(),10);
 await page.reload();await page.locator('#fingerprint .criterion-label').first().waitFor();
 assert.equal(await page.locator('#fingerprint .unknown').count(),10);
 await page.screenshot({path:join(output,'ui-desktop-empty.png'),fullPage:true});
 const missing=await page.request.post(base+'/api/projects',{data:{name:'Missing brief',url:'https://example.com'}});assert.equal(missing.status(),400);
 const resultPromise=page.waitForResponse(response=>response.url().endsWith('/runs')&&response.request().method()==='POST',{timeout:120000});
 await page.locator('#demo').click();
 const response=await resultPromise; assert.equal(response.status(),201);const run=await response.json() as Run;
 await page.waitForFunction(()=>document.getElementById('status')?.textContent?.startsWith('Saved'));
 assert.equal(run.status,'partial');assert.equal(run.assessment?.registry.checks.length,14);
 assert.equal(run.assessment?.stateCoverage.length,12);
 assert.ok(run.assessment?.stateCoverage.filter(s=>s.state!=='default').every(s=>s.coverage==='unknown'));
 assert.ok(run.versions.checks?.startsWith('curated-checks-1.0.0:'));
 assert.equal(run.rubric.axes.length,10); assert.equal(run.quality?.desktop.dealBreakers.length,9);
 assert.equal(run.quality?.desktop.rawTotal,null);assert.equal(run.quality?.desktop.cappedTotal,null);
 assert.equal(run.captures.every(c=>c.status==='ready'),true);
 assert.equal(run.results.find(r=>r.criterionId==='INTERACTION-POINTS')?.score,null);
 assert.equal(run.results.find(r=>r.criterionId==='MOT-01')?.score,null);
 assert.equal(run.results.find(r=>r.criterionId==='ADAPT-01')?.evidenceIds.length,2);
 assert.equal(run.quality?.desktop.dealBreakers.every(d=>d.verdict==='unknown'),true);
 const boxes=page.locator('#fixes input');assert.ok(await boxes.count()>0);await boxes.first().check();
 await page.locator('#handoff').click();await page.locator('#prompt-panel').waitFor({state:'visible'});
 assert.match(await page.locator('#prompt').inputValue(),/Selected/);
 assert.match(await page.locator('#prompt').inputValue(),/Preserve these/);
 assert.match(await page.locator('#prompt').inputValue(),/does not establish conversion or satisfaction/);
 await page.locator('#scores-details > summary').click();
 const saved=await (await page.request.get(base+'/api/runs/'+run.id)).json();assert.equal(saved.handoffs[0].selectedIds.length,1);
 await page.screenshot({path:join(output,'ui-desktop-result.png'),fullPage:true});
 for(const width of [360,400]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:join(output,`ui-mobile-${width}.png`),fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});
 const updatedRegistry=JSON.parse(await readFile(registryPath,'utf8'));updatedRegistry.version='curated-checks-test-2';await writeFile(registryPath,JSON.stringify(updatedRegistry));
 const nextPromise=page.waitForResponse(r=>r.url().endsWith('/runs')&&r.request().method()==='POST',{timeout:120000});await page.locator('#reevaluate').click();
 const next=await (await nextPromise).json() as Run;assert.equal(next.parentRunId,run.id);assert.equal(next.projectId,run.projectId);assert.equal(next.versions.checks,run.versions.checks);assert.deepEqual(next.assessment?.registry,run.assessment?.registry);
 await page.waitForFunction(()=>document.querySelectorAll('#runs option').length===2);
 await page.locator('#runs').selectOption(run.id);await page.locator('#viewport').selectOption('mobile');
 await page.reload();await page.locator('#projects').selectOption(run.projectId);await page.waitForFunction(()=>document.querySelectorAll('#runs option').length===2);
 await page.locator('#runs').selectOption(run.id);
 assert.equal(await page.locator('#fingerprint .criterion-label').count(),10);
 const latestResponse=await page.request.post(`${base}/api/projects/${run.projectId}/runs`,{data:{useLatestChecks:true,expectedText:'deliberately absent readiness marker'}});
 assert.equal(latestResponse.status(),201);const latest=await latestResponse.json() as Run;
 assert.equal(latest.assessment?.registry.version,'curated-checks-test-2');assert.notEqual(latest.versions.checks,run.versions.checks);assert.equal(latest.status,'failed');
 assert.deepEqual((await (await page.request.get(base+'/api/runs/'+run.id)).json()).run.assessment.registry,run.assessment?.registry);
 assert.deepEqual(errors,[]);
 // Exercise the real pipeline with an authored provider transport, never a paid request.
 const store=new Store(await mkdtemp(join(tmpdir(),'better-provider-pipeline-')));
 try {
  const project=store.createProject({id:randomUUID(),name:'Mock provider boundary',url:DEMO_URL,source:'controlled_demo',createdAt:new Date().toISOString(),profile:run.profile});
  let calls=0;
  const judge=new SubQJudge({apiKey:'test-only',allowPaid:true,model:'test',transport:(async(_url,init)=>{
   calls++;
   const body=JSON.parse(String(init?.body));
   assert.equal(Object.hasOwn(body,'detectorCounts'),false);assert.equal(Object.hasOwn(body,'results'),false);assert.equal(Object.hasOwn(body,'findings'),false);
   const finding=Object.keys(body.questions.finding.criteria).find(id=>id!=='none')!;
   const penalty=['HIER_IMPROVE','ORIGINALITY_IMPROVE'].includes(finding);
   const answers=Object.fromEntries(Object.entries(body.questions).map(([name,value])=>{
    const options=Object.keys((value as {criteria:Record<string,string>}).criteria);
    const choice=name==='rating'?(penalty?'0':options.filter(o=>o!=='not_assessed').at(-1)!):name==='finding'?(penalty?finding:'none'):name==='issue'?(penalty?'HIERARCHY':'none'):options.find(o=>o!=='none')!;
    return [name,{type:'choice',choice,confidence:.8,probabilities:Object.fromEntries(options.map(o=>[o,o===choice?1:0]))}];
   }));
   return new Response(JSON.stringify({model:'test',usage:{input_tokens:1,output_tokens:0},answers}));
  }) as typeof fetch});
  const judged=await evaluateProject(store,project.id,{},judge);
  assert.ok(calls>0);assert.equal(judged.results.find(r=>r.criterionId==='HIER-POINTS')?.issueId,'HIERARCHY');
  assert.equal(judged.quality?.desktop.criteria.find(c=>c.id==='HIER')?.points,0);
  assert.equal(judged.results.find(r=>r.criterionId==='ORIGINALITY-POINTS')?.status,'not_assessed');
  assert.equal(judged.quality?.desktop.criteria.find(c=>c.id==='ORIGINALITY')?.points,null);
  assert.equal(judged.quality?.desktop.rawTotal,null);
 } finally {store.close();}

 console.log('PASS: built UI → brief validation → paired real capture → ten-criterion unknown-safe result → selected-only saved handoff → reevaluation/history → desktop and 360/400px rendering, no console/network errors.');
 console.log(`Screenshots: ${output}/ui-*.png`);
} finally { await browser?.close(); if(server.exitCode===null){const exited=once(server,'exit');server.kill('SIGTERM');await exited;} }
