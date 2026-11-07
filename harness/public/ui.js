const $ = id => document.getElementById(id);
let rubric, project, run, history = [];
const el = (tag, text, parent) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (parent) parent.append(node); return node; };
async function api(path, body) { const response = await fetch('/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error + (data.fields ? ': ' + data.fields.join(', ') : '')); return data; }
// Fixture runs summarize authored sample points separately; never mix them with measured or judged points.
const qualityOf = (r, viewport) => r?.mode === 'fixture' && r?.fixtureQuality ? r.fixtureQuality[viewport] : r?.quality?.[viewport];
const sampleLabel = r => r?.mode === 'fixture' && r?.fixtureQuality ? 'SAMPLE DATA: authored fixture points, not an assessment. ' : '';
function status(text) { $('status').textContent = text; }
async function work(fn) { document.querySelectorAll('button').forEach(b => b.disabled = true); try { await fn(); } catch (error) { status(error.message); } finally { document.querySelectorAll('button').forEach(b => b.disabled = false); } }
function chart(axes, scores = []) {
 const svg = $('fingerprint'); svg.setAttribute('viewBox',matchMedia('(max-width:760px)').matches?'110 50 460 460':'0 0 680 560'); svg.replaceChildren(); $('chart-legend').replaceChildren(); const ns = 'http://www.w3.org/2000/svg';
 const draw = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); };
 const pos = (i,r) => { const a = i * Math.PI * 2 / axes.length - Math.PI / 2; return [340 + Math.cos(a)*r, 280 + Math.sin(a)*r]; };
 for (const radius of [48,96,144,192]) draw('polygon', { points: axes.map((_,i)=>pos(i,radius).join(',')).join(' '), class:'grid' });
 axes.forEach((a,i) => { const p = pos(i,192), label = pos(i,232); draw('line',{x1:340,y1:280,x2:p[0],y2:p[1],class:'axis'}); const s = scores.find(s=>s.id===a.id); const max = a.weight; const known = s?.points !== null && s?.points !== undefined && max; const q = pos(i, known ? 192*s.points/max : 192); draw('circle',{cx:q[0],cy:q[1],r:known?6:5,class:known?'point':'unknown'}); draw('text',{x:label[0],y:label[1],'text-anchor':'middle',class:'criterion-label'}, a.title); const number=pos(i,218); draw('text',{x:number[0],y:number[1],'text-anchor':'middle',class:'criterion-number'},String(i+1)); el('li',`${a.title}: ${known?s.points+' / '+max:'Unknown'}`,$('chart-legend')); if (known) { const next = scores.find(s=>s.id===axes[(i+1)%axes.length].id); if (next?.points !== null && next?.points !== undefined) { const end = pos((i+1)%axes.length,192*next.points/axes[(i+1)%axes.length].weight); draw('line',{x1:q[0],y1:q[1],x2:end[0],y2:end[1],class:'known'}); } } });
}
function scoreTable(axes, scores = []) {
 $('score-values').replaceChildren();
 const previous=history.find(h=>h.id===run?.parentRunId);
 const compatible=previous&&JSON.stringify(previous.versions)===JSON.stringify(run.versions);
 for(const axis of axes){
  const current=scores.find(c=>c.id===axis.id)?.points, before=qualityOf(previous,$('viewport').value)?.criteria.find(c=>c.id===axis.id)?.points;
  const row=el('tr',undefined,$('score-values')),heading=el('th',axis.title,row);heading.scope='row';
  el('td',`${current===null||current===undefined?'Unknown':current} / ${axis.weight??'Unspecified'}`,row);
  const delta=compatible&&current!==null&&current!==undefined&&before!==null&&before!==undefined?current-before:null;
  el('td',delta===null?(previous&&!compatible?'Not comparable':'No comparable value'):delta===0?'Unchanged':delta>0?`Increased by ${delta}`:`Decreased by ${-delta}`,row);
 }
}
function assessmentDetails(viewport){
 $('task-coverage').replaceChildren();$('structured-findings').replaceChildren();$('strengths').replaceChildren();
 const a=run?.assessment;
 if(!a){el('p','No curated-check ledger in this historical run.',$('task-coverage'));return;}
 for(const strength of a.strengths)el('li',strength.text,$('strengths'));
 if(!a.strengths.length)el('li','No additional product strengths verified. Preserve essential labels, errors, instructions and working alternatives.',$('strengths'));
 for(const step of a.taskSteps){
  const section=el('section',undefined,$('task-coverage'));el('h3',step.goal,section);el('p','Intended outcome: '+step.intendedOutcome,section);
  for(const state of a.stateCoverage.filter(s=>s.taskStep===step.id&&s.viewport===viewport)){
   const detail=el('details',undefined,section);el('summary',`${state.state}: ${state.coverage}`,detail);el('p',`${state.reason} Required evidence: ${state.requiredEvidence.join(', ')}.`,detail);
   for(const check of a.ledger.filter(c=>c.taskStep===step.id&&c.viewport===viewport&&c.state===state.state))el('p',`${check.checkId}: ${check.coverage}. ${check.reason} Missing evidence: ${check.missingEvidence.join(', ')||'none by kind; check verifier status'}. Exception: ${check.exceptionStatus}.`,detail);
  }
 }
 for(const f of a.findings.filter(f=>f.viewport===viewport)){
  const article=el('article',undefined,$('structured-findings'));el('h3',`${f.primaryCriterion} · ${f.issueFamilyId} · ${f.kind}`,article);
  el('p',`${f.taskStep} / ${f.state} · ${f.coverageStatus} · severity ${f.severity} · verifier ${f.verifier} · exception ${f.exceptionStatus}`,article);
  el('p','Observed: '+f.observedImpact,article);if(f.hypothesizedImpact)el('p','Hypothesis: '+f.hypothesizedImpact,article);
  const group=a.reconciliations.find(g=>g.findingIds.includes(f.id));if(group)el('p',`${group.relation}: ${group.review||'One underlying defect; no extra check deduction.'}`,article);
 }
}
function render() {
 const r = run?.rubric || rubric, viewport = $('viewport').value, q = qualityOf(run, viewport);
 chart(r.axes, q?.criteria); scoreTable(r.axes,q?.criteria);assessmentDetails(viewport); $('context').textContent = project ? project.name + ' — ' + project.url : 'One core job. Ten criteria. Evidence behind every result.';
 $('coverage').textContent = q ? `${sampleLabel(run)}${q.coverage.assessedCriteria}/${q.coverage.totalCriteria} criteria assessed · ${q.coverage.assessedWeight}/100 proposed weight covered` : 'No combined-rubric evaluation yet';
 $('totals').replaceChildren(); if(q) { for(const [label,value] of [['Raw total',q.rawTotal],['Capped total',q.cappedTotal],['Observed subtotal (incomplete)',q.observedSubtotal]]) el('div',`${label}: ${value===null?'Unknown':value}`, $('totals')); el('strong',q.band || 'Band unknown', $('totals')); el('div',q.capApplied?`Verified failure: proposed cap ${q.cap} applies.`:'No verified deal-breaker failure established.', $('totals'));  const l3=q.layer3; if(l3){ el('div',`Layer 3 detector: ${l3.status} (${l3.coverage.covered}/${l3.coverage.total} rules)${l3.status==='complete'?'':'. No Layer 3 total; unrun rules are unknown, not passed.'}`,$('totals')); el('div',`After Layer 3: ${l3.cappedTotal===null?'Unknown':l3.cappedTotal}${l3.capApplied&&l3.cappedTotal!==null?` (capped at ${l3.cap})`:''}${l3.provisional?` · provisional, ${l3.pendingAdvisoryPoints} advisory point(s) await review`:''}${l3.band?' · '+l3.band:''}`,$('totals')); const fixes=el('ol',undefined,$('totals')); fixes.setAttribute('aria-label','Top fixes'); for(const f of l3.review.topFixes) el('li',`${f.priority} · ${f.label}: ${f.detail}`,fixes); if(!l3.review.topFixes.length) el('li','No prioritized fix established from the available evidence.',fixes); const keep=el('ul',undefined,$('totals')); keep.setAttribute('aria-label','Preserve these'); for(const p of l3.review.preserve) el('li','Preserve: '+p,keep); } }
 $('policy-note').textContent = (r.combined?.unresolved || ['Historical rubric snapshot.']).join(' '); $('policy').textContent = JSON.stringify(r.combined || r,null,2);
 $('actions').hidden = !run; $('start').hidden = !!project; $('fixes').replaceChildren(); $('prompt-panel').hidden=true;
 for(const s of run?.suggestions || []) { const article=el('article',undefined,$('fixes')), label=el('label',undefined,article), box=el('input',undefined,label); box.type='checkbox';box.value=s.id; const f=run?.assessment?.findings.find(f=>f.suggestionId===s.id); const conflict=f&&run.assessment.reconciliations.find(g=>g.findingIds.includes(f.id)&&g.relation==='conflicting');if(conflict){box.disabled=true;el('p','Human review required: '+conflict.review,article);} el('span',s.label,label); el('p',`${s.viewport} · ${s.provenance==='fixture'?'SAMPLE DATA':s.provenance}: ${s.problem}`,article);el('p',s.change,article); }
 $('empty-fixes').textContent = run?.suggestions.length?'Select only the changes you want in your implementation prompt.':'No supported fixes available. Review evidence and unresolved scoring policy.';
 $('handoff').hidden=!run?.suggestions.length; $('evidence').replaceChildren();
 if(q) for(const c of q.criteria){ const article=el('article',undefined,$('evidence'));el('h3',`${c.title}: ${c.points===null?'Unknown':c.points} / ${c.max}`,article);el('p',c.reason,article); }
 for(const result of run?.results.filter(r=>r.viewport===viewport)||[]) { const article=el('article',undefined,$('evidence'));el('h3',result.criterionId,article);el('p',result.reason,article);for(const id of result.evidenceIds){const a=el('a',id.split(':').slice(-1)[0],article);a.href=`/api/runs/${run.id}/evidence/${encodeURIComponent(id)}`;a.setAttribute('download','');} }
 if(q) for(const o of q.dealBreakers) el('p',`${o.id}: ${o.verdict}${o.verified?' ('+o.evidenceKind+' verified)':''}`, $('evidence'));
 if(q?.layer3){ for(const g of q.layer3.gates) el('p',`Gate ${g.ruleId}: ${g.verdict}${g.verified?' (verified)':''}`,$('evidence')); for(const d of q.layer3.deductions) el('p',`Layer 3 ${d.ruleId} → ${d.criterion}: ${d.status}${d.points?' −'+d.points:''} (${d.severity}, ${d.occurrences}×, ${d.sources.join('/')})`,$('evidence')); for(const c of q.layer3.criteria) el('p',`${c.title}: raw ${c.raw===null?'Unknown':c.raw} → ${c.final===null?'Unknown':c.final}. ${c.reason}`,$('evidence')); }
}
async function projects() { const rows=await api('/projects');$('projects').replaceChildren(new Option('New project',''));rows.forEach(p=>$('projects').add(new Option(p.name,p.id)));if(project)$('projects').value=project.id; }
async function loadProject(id) { const data=await api('/projects/'+id);project=data.project;history=data.runs;$('runs').replaceChildren();history.forEach(r=>$('runs').add(new Option(`${r.createdAt} · ${r.status}`,r.id)));run=history.at(-1);if(run)$('runs').value=run.id;render(); }
async function evaluate() { status('Capturing desktop and mobile. This may take a moment.'); const next=await api(`/projects/${project.id}/runs`,{});await loadProject(project.id);run=next;render();status(`Saved ${run.status} evaluation. ${sampleLabel(run)}${qualityOf(run,'desktop')?.unresolved.join(' ') || ''}`); }
$('brief').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const data=Object.fromEntries(new FormData(event.target));project=await api('/projects',{name:new URL(data.url).hostname,url:data.url,profile:{version:'brief-1',task:data.task,audience:data.audience,feeling:data.feeling,taste:'',avoid:'',brand:''}});await projects();await evaluate();});});
$('demo').onclick=()=>work(async()=>{project=await api('/projects',{name:'Controlled Fieldwork demo',demo:true});await projects();await evaluate();});
$('projects').onchange=()=>work(async()=>{if(!$('projects').value){project=run=undefined;history=[];render();return;}await loadProject($('projects').value);status('Loaded saved project.');});
$('runs').onchange=()=>{run=history.find(r=>r.id===$('runs').value);render();};$('viewport').onchange=render;
$('reevaluate').onclick=()=>work(evaluate);
$('handoff').onclick=()=>work(async()=>{const selectedIds=[...$('fixes').querySelectorAll('input:checked')].map(i=>i.value);if(!selectedIds.length)throw new Error('Select at least one fix.');const h=await api(`/runs/${run.id}/handoffs`,{selectedIds});$('prompt').value=h.prompt;$('prompt-panel').hidden=false;status('Selected prompt saved to this run.');});
$('copy').onclick=()=>work(async()=>{await navigator.clipboard.writeText($('prompt').value);status('Prompt copied.');});
window.addEventListener('resize',()=>{if(rubric)chart((run?.rubric||rubric).axes,qualityOf(run,$('viewport').value)?.criteria);});
work(async()=>{rubric=await api('/rubric');await projects();render();});
