'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { api } from './harness';
import type { Profile } from './harness/types';

const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v.trim() : '');

// View 1 collects name+URL only; the Combined rubric requires the brief
// (task/audience/feeling) at project creation, so the project is created
// at the END of onboarding together with the profile and first run.
export async function beginOnboardingAction(formData: FormData) {
  const name = str(formData.get('name'));
  const url = str(formData.get('url'));
  const demo = formData.get('demo') === 'on';
  if (!name) redirect('/?error=Project+name+is+required.');
  if (demo) {
    const project = await api.createProject({ name, demo: true });
    redirect(`/projects/${project.id}/onboarding`);
  }
  if (!url) redirect('/?error=A+public+URL+is+required.');
  redirect(`/onboarding?name=${encodeURIComponent(name!)}&url=${encodeURIComponent(url!)}`);
}

export async function createProjectWithBriefAction(formData: FormData) {
  const name = str(formData.get('name'));
  const url = str(formData.get('url'));
  if (!name || !url) redirect('/?error=Missing+project+details.');
  const profile: Profile = {
    version: 'profile-1',
    task: str(formData.get('task')),
    audience: str(formData.get('audience')),
    feeling: str(formData.get('feeling')),
    taste: str(formData.get('taste')),
    avoid: str(formData.get('avoid')),
    brand: str(formData.get('brand')),
  };
  try {
    const project = await api.createProject({ name: name!, url: url!, profile });
    const run = await api.createRun(project.id, {});
    redirect(`/projects/${project.id}?run=${run.id}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Could not create the project.';
    redirect(`/onboarding?name=${encodeURIComponent(name!)}&url=${encodeURIComponent(url!)}&error=${encodeURIComponent(msg)}`);
  }
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
