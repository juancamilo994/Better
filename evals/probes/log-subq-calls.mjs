// Logs every SubQ request/response so drift can be traced. Images are hashed in the summary; full bodies kept for replay.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const dir = process.env.SUBQ_LOG_DIR; const orig = globalThis.fetch; let n = 0;
const h = s => createHash('sha256').update(s).digest('hex').slice(0, 12);
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.subq.ai')) return orig(url, init);
  const id = String(++n).padStart(4, '0'); const body = JSON.parse(init.body);
  writeFileSync(`${dir}/${id}-req.json`, init.body);
  const res = await orig(url, init); const text = await res.clone().text();
  writeFileSync(`${dir}/${id}-res.json`, text);
  const q = Object.keys(body.questions);
  writeFileSync(`${dir}/${id}-sum.json`, JSON.stringify({ id, t: Date.now(), viewport: body.state.viewport, ratingInstr: h(body.questions.rating.instructions), ratingOpts: Object.keys(body.questions.rating.criteria), questions: q, images: body.images.map(i => h(i.base64)), textHash: h(body.state.untrusted_page_evidence.text), elemHash: h(JSON.stringify(body.state.untrusted_page_evidence.elements)), status: res.status, answers: (()=>{try{return JSON.parse(text).answers}catch{return null}})() }));
  return res;
};
