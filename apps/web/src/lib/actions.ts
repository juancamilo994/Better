'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from './harness';
import type { Profile } from './harness/types';

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

export async function createProjectAction(formData: FormData) {
  const name = str(formData.get('name'));
  const url = str(formData.get('url'));
  const demo = formData.get('demo') === 'on';
  if (!name) throw new Error('Project name is required.');
  if (!demo && !url) throw new Error('A public URL is required.');
  const project = await api.createProject(demo ? { name, demo: true } : { name, url });
  redirect(`/projects/${project.id}/onboarding`);
}

export async function startRunAction(projectId: string, formData: FormData) {
  const profile: Profile = {
    version: 'profile-1',
    task: str(formData.get('task')) || 'Help visitors find the next useful action.',
    audience: str(formData.get('audience')) || 'First-time visitors',
    feeling: str(formData.get('feeling')) || undefined,
    taste: str(formData.get('taste')),
    avoid: str(formData.get('avoid')),
    brand: str(formData.get('brand')),
  };
  const run = await api.createRun(projectId, { profile });
  redirect(`/projects/${projectId}?run=${run.id}`);
}

export async function reevaluateAction(projectId: string) {
  const run = await api.createRun(projectId, {});
  revalidatePath(`/projects/${projectId}`);
  redirect(`/projects/${projectId}?run=${run.id}`);
}

export async function createHandoffAction(projectId: string, runId: string, selectedIds: string[]) {
  const handoff = await api.createHandoff(runId, selectedIds);
  redirect(`/projects/${projectId}/prompt?run=${runId}&handoff=${handoff.id}`);
}
