import type {
  CompareResult,
  CreateProjectInput,
  CreateRunInput,
  Handoff,
  Project,
  ProjectDetail,
  Rubric,
  Run,
  RunDetail,
} from './types';

const BASE = (process.env.HARNESS_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

export class HarnessError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: string[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/api${path}`, init);
  } catch {
    throw new HarnessError(`Harness unreachable at ${BASE}. Is it running? (npm start in /harness)`, 0);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; fields?: string[] };
  if (!response.ok) throw new HarnessError(data.error ?? `Harness returned ${response.status}`, response.status, data.fields);
  return data as T;
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const harness = {
  health: () => request<{ ok: boolean; mode: string; paidCallsEnabled: boolean; busy: boolean }>('/health'),
  getRubric: () => request<Rubric>('/rubric'),
  listProjects: () => request<Project[]>('/projects'),
  createProject: (input: CreateProjectInput) => post<Project>('/projects', input),
  getProject: (id: string) => request<ProjectDetail>(`/projects/${encodeURIComponent(id)}`),
  createRun: (projectId: string, input: CreateRunInput = {}) => post<Run>(`/projects/${encodeURIComponent(projectId)}/runs`, input),
  getRun: (id: string) => request<RunDetail>(`/runs/${encodeURIComponent(id)}`),
  compareRuns: (currentId: string, baselineId: string) =>
    request<CompareResult>(`/runs/${encodeURIComponent(currentId)}/compare/${encodeURIComponent(baselineId)}`),
  createHandoff: (runId: string, selectedIds: string[]) =>
    post<Handoff>(`/runs/${encodeURIComponent(runId)}/handoffs`, { selectedIds }),
  createCorrection: (runId: string, criterionId: string, viewport: 'desktop' | 'mobile', note: string) =>
    post<unknown>(`/runs/${encodeURIComponent(runId)}/corrections`, { criterionId, viewport, note }),
  evidenceUrl: (runId: string, evidenceId: string) =>
    `${BASE}/api/runs/${encodeURIComponent(runId)}/evidence/${encodeURIComponent(evidenceId)}`,
};
