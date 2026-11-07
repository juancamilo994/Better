import Link from 'next/link';
import { api, isMock } from '@/lib/harness';
import { beginOnboardingAction } from '@/lib/actions';
import { HarnessError } from '@/lib/harness/client';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: formError } = await searchParams;
  let projects: Awaited<ReturnType<typeof api.listProjects>> = [];
  let error: string | null = formError ?? null;
  try {
    projects = await api.listProjects();
  } catch (e) {
    error = e instanceof HarnessError ? e.message : 'Could not load projects.';
  }

  return (
    <main>
      <h1>Better</h1>
      <p>Score a design, see what better looks like on your own site, and get the exact prompt to fix it.</p>
      {isMock && <p><em>MOCK MODE — fixture data (BETTER_MOCK_MODE=1)</em></p>}
      {error && <p role="alert">{error}</p>}

      <section aria-label="Projects">
        {projects.length === 0 && !error && <p>No projects yet. Create one to get started.</p>}
        <ul>
          {projects.map(p => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}>{p.name}</Link>
              {' — '}{p.url}{p.source === 'controlled_demo' ? ' (demo)' : ''}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Create project">
        <h2>New project</h2>
        <form action={beginOnboardingAction}>
          <label>Name <input name="name" required maxLength={120} /></label>
          <label>URL <input name="url" type="url" placeholder="https://…" /></label>
          <label><input name="demo" type="checkbox" /> Demo project (controlled page, no URL needed)</label>
          <button type="submit">Create</button>
        </form>
      </section>
    </main>
  );
}
