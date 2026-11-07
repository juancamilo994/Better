import { resolve } from 'node:path';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError, profileSchema } from './domain.ts';
import { loadRubric } from './config.ts';
import { publicTarget } from './capture/network.ts';
import { DEMO_URL } from './capture/demo.ts';
import { evaluateProject } from './evaluation/pipeline.ts';
import { compareRuns } from './evaluation/aggregation.ts';
import { Store } from './store.ts';

const defaultProfile = { version: 'profile-1', task: 'Help visitors find the next useful action.', audience: 'First-time visitors', feeling: 'Welcoming and practical', taste: '', avoid: '', brand: '' };
const createSchema = z.object({ name: z.string().min(1).max(120), url: z.string().max(2000).optional(), demo: z.boolean().optional(), profile: profileSchema.optional() }).strict();
const evaluateSchema = z.object({ buildLabel: z.string().max(200).optional(), demoVersion: z.enum(['baseline', 'revised']).optional(), expectedText: z.string().max(500).optional(), profile: profileSchema.optional(), useLatestRubric: z.boolean().optional() }).strict();
const idSchema = z.uuid();

export function createApp(store: Store) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; sandbox", 'Cache-Control': 'no-store' });
    // Local single-user harness. Reject hostile Host/Origin headers instead of
    // offering an unauthenticated capture service to arbitrary browser origins.
    const host = req.headers.host ?? '';
    let hostname: string;
    try { hostname = new URL(`http://${host}`).hostname; } catch { return res.status(403).json({ error: 'Invalid host.' }); }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return res.status(403).json({ error: 'Local harness only.' });
    if (req.headers.origin && req.headers.origin !== `http://${host}`) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    if (req.method !== 'GET' && !req.is('application/json')) return res.status(415).json({ error: 'Use application/json.' });
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  let busy = false;
  for (const [route, file] of [['/', 'index.html'], ['/ui.js', 'ui.js'], ['/ui.css', 'ui.css']]) app.get(route, (_req, res) => {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.sendFile(resolve('public', file));
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true, mode: process.env.BETTER_JUDGE || 'fixture', paidCallsEnabled: process.env.BETTER_ALLOW_PAID_CALLS === 'true', busy }));
  app.get('/api/rubric', (_req, res) => res.json(loadRubric()));
  app.get('/api/projects', (_req, res) => res.json(store.listProjects()));
  app.post('/api/projects', async (req, res) => {
    const input = createSchema.parse(req.body);
    if (!input.demo && !input.url) throw new AppError('A public URL is required.');
    if (!input.demo && loadRubric().combined && (!input.profile?.audience.trim() || !input.profile?.task.trim() || !input.profile?.feeling?.trim())) throw new AppError('Provide who the site is for, the desired feeling and one core job.');
    const url = input.demo ? DEMO_URL : (await publicTarget(input.url!)).url.href;
    const project = store.createProject({ id: randomUUID(), name: input.name, url, source: input.demo ? 'controlled_demo' : 'public_url', createdAt: new Date().toISOString(), profile: input.profile ?? defaultProfile });
    res.status(201).json(project);
  });
  app.get('/api/projects/:id', (req, res) => { const id = idSchema.parse(req.params.id); res.json({ project: store.project(id), runs: store.runs(id) }); });
  app.post('/api/projects/:id/runs', async (req, res) => {
    const id = idSchema.parse(req.params.id); const options = evaluateSchema.parse(req.body);
    store.project(id);
    if (busy) throw new AppError('A capture is already running. Retry after it finishes.', 409);
    busy = true;
    try { res.status(201).json(await evaluateProject(store, id, options)); }
    finally { busy = false; }
  });
  app.get('/api/runs/:id', (req, res) => { const id = idSchema.parse(req.params.id); res.json({ run: store.run(id), handoffs: store.handoffs(id), corrections: store.corrections(id) }); });
  app.get('/api/runs/:id/compare/:baseline', (req, res) => res.json(compareRuns(store.run(idSchema.parse(req.params.baseline)), store.run(idSchema.parse(req.params.id)))));
  app.get('/api/runs/:id/evidence/:evidenceId', async (req, res) => {
    const { artifact, bytes } = await store.evidence(idSchema.parse(req.params.id), String(req.params.evidenceId));
    res.set('Content-Disposition', `attachment; filename="${artifact.file}"`);
    res.type(['screenshot', 'full_screenshot'].includes(artifact.kind) ? 'image/png' : 'text/plain').send(bytes);
  });
  app.post('/api/runs/:id/handoffs', (req, res) => {
    const input = z.object({ selectedIds: z.array(z.string().max(200)).min(1).max(100) }).strict().parse(req.body);
    res.status(201).json(store.handoff(idSchema.parse(req.params.id), input.selectedIds));
  });
  app.post('/api/runs/:id/corrections', (req, res) => {
    const input = z.object({ criterionId: z.string().max(100), viewport: z.enum(['desktop', 'mobile']), note: z.string().min(1).max(2000) }).strict().parse(req.body);
    res.status(201).json(store.correct(idSchema.parse(req.params.id), input.criterionId, input.viewport, input.note));
  });
  app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input.', fields: error.issues.map(i => i.path.join('.')) });
    if (error instanceof AppError) return res.status(error.status).json({ error: error.message });
    return res.status(500).json({ error: 'Operation failed. No fabricated results were returned.' });
  });
  return app;
}
