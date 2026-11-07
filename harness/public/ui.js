const $ = id => document.getElementById(id);
let rubric, project, run, history = [];
const el = (tag, text, parent) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (parent) parent.append(node); return node; };
async function api(path, body) { const response = await fetch('/api' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error + (data.fields ? ': ' + data.fields.join(', ') : '')); return data; }
function status(text) { $('status').textContent = text; }
async function work(fn) { document.querySelectorAll('button').forEach(b => b.disabled = true); try { await fn(); } catch (error) { status(error.message); } finally { document.querySelectorAll('button').forEach(b => b.disabled = false); } }
function chart(axes, scores = []) {
 const svg = $('fingerprint'); svg.setAttribute('viewBox',matchMedia('(max-width:760px)').matches?'110 50 460 460':'0 0 680 560'); svg.replaceChildren(); $('chart-legend').replaceChildren(); const ns = 'http://www.w3.org/2000/svg';
 const draw = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k, v); if (text) n.textContent = text; svg.append(n); };
 const pos = (i,r) => { const a = i * Math.PI * 2 / axes.length - Math.PI / 2; return [340 + Math.cos(a)*r, 280 + Math.sin(a)*r]; };
 for (const radius of [48,96,144,192]) draw('polygon', { points: axes.map((_,i)=>pos(i,radius).join(',')).join(' '), class:'grid' });
 axes.forEach((a,i) => { const p = pos(i,192), label = pos(i,232); draw('line',{x1:340,y1:280,x2:p[0],y2:p[1],class:'axis'}); const s = scores.find(s=>s.id===a.id); const max = a.weight; const known = s?.points !== null && s?.points !== undefined && max; const q = pos(i, known ? 192*s.points/max : 192); draw('circle',{cx:q[0],cy:q[1],r:known?6:5,class:known?'point':'unknown'}); draw('text',{x:label[0],y:label[1],'text-anchor':'middle',class:'criterion-label'}, a.title); const number=pos(i,218); draw('text',{x:number[0],y:number[1],'text-anchor':'middle',class:'criterion-number'},String(i+1)); el('li',`${a.title}: ${known?s.points+' / '+max:'Unknown'}`,$('chart-legend')); if (known) { const next = scores.find(s=>s.id===axes[(i+1)%axes.length].id); if (next?.points !== null && next?.points !== undefined) { const end = pos((i+1)%axes.length,192*next.points/axes[(i+1)%axes.length].weight); draw('line',{x1:q[0],y1:q[1],x2:end[0],y2:end[1],class:'known'}); } } });
}
function render() {
 const r = run?.rubric || rubric, viewport = $('viewport').value, q = run?.quality?.[viewport];
 chart(r.axes, q?.criteria); $('context').textContent = project ? project.name + ' — ' + project.url : 'One core job. Ten criteria. Evidence behind every result.';
 $('coverage').textContent = q ? `${q.coverage.assessedCriteria}/${q.coverage.totalCriteria} criteria assessed · ${q.coverage.assessedWeight}/100 proposed weight covered` : 'No combined-rubric evaluation yet';
 $('totals').replaceChildren(); if(q) { for(const [label,value] of [['Raw total',q.rawTotal],['Capped total',q.cappedTotal],['Observed subtotal (incomplete)',q.observedSubtotal]]) el('div',`${label}: ${value===null?'Unknown':value}`, $('totals')); el('strong',q.band || 'Band unknown', $('totals')); el('div',q.capApplied?`Verified failure: proposed cap ${q.cap} applies.`:'No verified deal-breaker failure established.', $('totals')); }
 $('policy-note').textContent = (r.combined?.unresolved || ['Historical rubric snapshot.']).join(' '); $('policy').textContent = JSON.stringify(r.combined || r,null,2);
 $('actions').hidden = !run; $('start').hidden = !!project; $('fixes').replaceChildren(); $('prompt-panel').hidden=true;
 for(const s of run?.suggestions || []) { const article=el('article',undefined,$('fixes')), label=el('label',undefined,article), box=el('input',undefined,label); box.type='checkbox';box.value=s.id; el('span',s.label,label); el('p',`${s.viewport} · ${s.provenance==='fixture'?'SAMPLE DATA':s.provenance}: ${s.problem}`,article);el('p',s.change,article); }
 $('empty-fixes').textContent = run?.suggestions.length?'Select only the changes you want in your implementation prompt.':'No supported fixes available. Review evidence and unresolved scoring policy.';
 $('handoff').hidden=!run?.suggestions.length; $('evidence').replaceChildren();
 if(q) for(const c of q.criteria){ const article=el('article',undefined,$('evidence'));el('h3',`${c.title}: ${c.points===null?'Unknown':c.points} / ${c.max}`,article);el('p',c.reason,article); }
 for(const result of run?.results.filter(r=>r.viewport===viewport)||[]) { const article=el('article',undefined,$('evidence'));el('h3',result.criterionId,article);el('p',result.reason,article);for(const id of result.evidenceIds){const a=el('a',id.split(':').slice(-1)[0],article);a.href=`/api/runs/${run.id}/evidence/${encodeURIComponent(id)}`;a.setAttribute('download','');} }
 if(q) for(const o of q.dealBreakers) el('p',`${o.id}: ${o.verdict}${o.verified?' ('+o.evidenceKind+' verified)':''}`, $('evidence'));
}
async function projects() { const rows=await api('/projects');$('projects').replaceChildren(new Option('New project',''));rows.forEach(p=>$('projects').add(new Option(p.name,p.id)));if(project)$('projects').value=project.id; }
async function loadProject(id) { const data=await api('/projects/'+id);project=data.project;history=data.runs;$('runs').replaceChildren();history.forEach(r=>$('runs').add(new Option(`${r.createdAt} · ${r.status}`,r.id)));run=history.at(-1);if(run)$('runs').value=run.id;render(); }
async function evaluate() { status('Capturing desktop and mobile. This may take a moment.'); const next=await api(`/projects/${project.id}/runs`,{});await loadProject(project.id);run=next;render();status(`Saved ${run.status} evaluation. ${run.quality?.desktop.unresolved.join(' ') || ''}`); }
$('brief').addEventListener('submit',event=>{event.preventDefault();work(async()=>{const data=Object.fromEntries(new FormData(event.target));project=await api('/projects',{name:new URL(data.url).hostname,url:data.url,profile:{version:'brief-1',task:data.task,audience:data.audience,feeling:data.feeling,taste:'',avoid:'',brand:''}});await projects();await evaluate();});});
$('demo').onclick=()=>work(async()=>{project=await api('/projects',{name:'Controlled Fieldwork demo',demo:true});await projects();await evaluate();});
$('projects').onchange=()=>work(async()=>{if(!$('projects').value){project=run=undefined;history=[];render();return;}await loadProject($('projects').value);status('Loaded saved project.');});
$('runs').onchange=()=>{run=history.find(r=>r.id===$('runs').value);render();};$('viewport').onchange=render;
$('reevaluate').onclick=()=>work(evaluate);
$('handoff').onclick=()=>work(async()=>{const selectedIds=[...$('fixes').querySelectorAll('input:checked')].map(i=>i.value);if(!selectedIds.length)throw new Error('Select at least one fix.');const h=await api(`/runs/${run.id}/handoffs`,{selectedIds});$('prompt').value=h.prompt;$('prompt-panel').hidden=false;status('Selected prompt saved to this run.');});
$('copy').onclick=()=>work(async()=>{await navigator.clipboard.writeText($('prompt').value);status('Prompt copied.');});
window.addEventListener('resize',()=>{if(rubric)chart((run?.rubric||rubric).axes,run?.quality?.[$('viewport').value]?.criteria);});
work(async()=>{rubric=await api('/rubric');await projects();render();});
