import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, type Correction, type Handoff, type Project, type Run } from './domain.ts';
import { hash } from './config.ts';
import { assemblePrompt } from './evaluation/explanations.ts';

export class Store {
  readonly directory: string;
  private db: DatabaseSync;
  constructor(directory: string) {
    this.directory = directory;
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'better.sqlite'));
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS handoffs (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS corrections (id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id), data TEXT NOT NULL);
    `);
    for (const table of ['runs', 'handoffs', 'corrections']) {
      for (const operation of ['UPDATE', 'DELETE']) this.db.exec(`CREATE TRIGGER IF NOT EXISTS immutable_${table}_${operation} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT, 'Append-only evaluation history'); END;`);
    }
  }
  close() { this.db.close(); }
  createProject(project: Project) {
    this.db.prepare('INSERT INTO projects (id,data) VALUES (?,?)').run(project.id, JSON.stringify(project));
    return project;
  }
  // Archived projects leave the list; their append-only runs stay readable by ID.
  listProjects(): Project[] { return this.db.prepare('SELECT data FROM projects ORDER BY rowid DESC').all().map(row => JSON.parse(String(row.data)) as Project).filter(p => !p.archivedAt); }
  archiveProject(id: string): Project {
    const project = { ...this.project(id), archivedAt: new Date().toISOString() };
    this.db.prepare('UPDATE projects SET data=? WHERE id=?').run(JSON.stringify(project), id);
    return project;
  }
  latestRun(projectId: string): Run | null {
    const row = this.db.prepare('SELECT data FROM runs WHERE project_id=? ORDER BY rowid DESC LIMIT 1').get(projectId);
    return row ? JSON.parse(String(row.data)) : null;
  }
  project(id: string): Project {
    const row = this.db.prepare('SELECT data FROM projects WHERE id=?').get(id);
    if (!row) throw new AppError('Project not found.', 404);
    return JSON.parse(String(row.data));
  }
  saveRun(run: Run) {
    this.db.prepare('INSERT INTO runs (id,project_id,data) VALUES (?,?,?)').run(run.id, run.projectId, JSON.stringify(run));
    return run;
  }
  run(id: string): Run {
    const row = this.db.prepare('SELECT data FROM runs WHERE id=?').get(id);
    if (!row) throw new AppError('Run not found.', 404);
    return JSON.parse(String(row.data));
  }
  runs(projectId: string): Run[] {
    this.project(projectId);
    return this.db.prepare('SELECT data FROM runs WHERE project_id=? ORDER BY rowid').all(projectId).map(row => JSON.parse(String(row.data)));
  }
  handoff(runId: string, selectedIds: string[]): Handoff {
    const run = this.run(runId);
    const record: Handoff = { id: randomUUID(), runId, createdAt: new Date().toISOString(), selectedIds, deferredIds: run.suggestions.filter(s => !selectedIds.includes(s.id)).map(s => s.id), prompt: assemblePrompt(run, selectedIds) };
    this.db.prepare('INSERT INTO handoffs (id,run_id,data) VALUES (?,?,?)').run(record.id, runId, JSON.stringify(record));
    return record;
  }
  handoffs(runId: string): Handoff[] { return this.db.prepare('SELECT data FROM handoffs WHERE run_id=? ORDER BY rowid').all(runId).map(row => JSON.parse(String(row.data))); }
  correct(runId: string, criterionId: string, viewport: 'desktop' | 'mobile', note: string): Correction {
    const run = this.run(runId);
    if (!run.results.some(r => r.criterionId === criterionId && r.viewport === viewport)) throw new AppError('Correction must reference a result in this run.');
    const record: Correction = { id: randomUUID(), runId, criterionId, viewport, note, createdAt: new Date().toISOString() };
    this.db.prepare('INSERT INTO corrections (id,run_id,data) VALUES (?,?,?)').run(record.id, runId, JSON.stringify(record));
    return record;
  }
  corrections(runId: string): Correction[] { return this.db.prepare('SELECT data FROM corrections WHERE run_id=? ORDER BY rowid').all(runId).map(row => JSON.parse(String(row.data))); }
  async evidence(runId: string, evidenceId: string) {
    const artifact = this.run(runId).captures.flatMap(c => c.artifacts).find(a => a.id === evidenceId);
    if (!artifact) throw new AppError('Evidence not found.', 404);
    const bytes = await readFile(join(this.directory, 'evidence', runId, artifact.file));
    if (hash(bytes) !== artifact.sha256) throw new AppError('Evidence integrity check failed.', 409);
    return { artifact, bytes };
  }
}
