import { harness as real } from './client';
import { fixtureProject, fixtureProjectDetail, fixtureRubric, fixtureRun, fixtureRunDetail } from './fixtures';
import type { CreateProjectInput, CreateRunInput, Handoff, Project, ProjectDetail, Rubric, RunDetail } from './types';

const MOCK = process.env.BETTER_MOCK_MODE === '1';

// Same surface as `harness`, backed by fixtures when BETTER_MOCK_MODE=1.
// Mock mutations are in-memory per request only — sufficient for UI dev.
const mock = {
  health: async () => ({ ok: true, mode: 'fixture', paidCallsEnabled: false, busy: false }),
  getRubric: async (): Promise<Rubric> => fixtureRubric,
  listProjects: async (): Promise<Project[]> => [fixtureProject],
  createProject: async (input: CreateProjectInput): Promise<Project> => ({
    id: 'mock-new-project', name: input.name, url: input.url ?? 'https://example.com/',
    source: input.demo ? 'controlled_demo' : 'public_url', createdAt: new Date().toISOString(),
    profile: { version: 'profile-1', task: '', audience: '', taste: '', avoid: '', brand: '', ...input.profile },
  }),
  getProject: async (): Promise<ProjectDetail> => fixtureProjectDetail,
  createRun: async () => fixtureRun('fixture-run-2', fixtureProject.id, 'second'),
  getRun: async (id: string): Promise<RunDetail> => fixtureRunDetail(id),
  compareRuns: async (currentId: string, baselineId: string) => ({
    baselineRunId: baselineId, currentRunId: currentId, compatible: true, reasons: [],
    deltas: [], failures: [],
  }),
  createHandoff: async (runId: string, selectedIds: string[]): Promise<Handoff> => ({
    id: 'mock-handoff', runId, createdAt: new Date().toISOString(),
    selectedIds, deferredIds: [],
    prompt: `# Improve the UI\n\nApply only these changes:\n\n${selectedIds.map(id => `- ${id}`).join('\n')}`,
  }),
  createCorrection: async () => ({}),
  evidenceUrl: (runId: string, evidenceId: string) => `/api/mock-evidence/${encodeURIComponent(runId)}/${encodeURIComponent(evidenceId)}`,
};

export const api = MOCK ? mock : real;
export const isMock = MOCK;
