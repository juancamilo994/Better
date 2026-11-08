import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { api, isMock } from '@/lib/harness';
import { beginOnboardingAction, archiveProjectAction } from '@/lib/actions';
import { HarnessError } from '@/lib/harness/client';
import { SubmitButton } from '@/components/SubmitButton';
import { Button } from '@/components/ui/button';

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
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
      <section className="animate-rise grid min-h-[60vh] items-end gap-10 py-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          {isMock && (
            <p className="mb-4 inline-block rounded-full bg-secondary/40 px-3 py-1 text-xs font-medium text-secondary-foreground">
              MOCK MODE — fixture data (BETTER_MOCK_MODE=1)
            </p>
          )}
          <h1 className="text-6xl font-semibold leading-[1.12] tracking-normal sm:text-8xl">
            Make what
            <br />
            you built
            <br />
            better.
          </h1>
          <form action={beginOnboardingAction} className="mt-10 max-w-xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:rounded-full sm:border sm:border-url-entry-border sm:bg-url-entry sm:p-2">
              <input
                name="name"
                required
                maxLength={120}
                placeholder="Project name"
                aria-label="Project name"
                className="min-w-0 rounded-full border border-url-entry-border bg-url-entry px-5 py-3 text-base outline-none placeholder:text-muted-foreground sm:w-36 sm:rounded-none sm:border-0 sm:bg-transparent"
              />
              <input
                name="url"
                type="url"
                placeholder="https://your-app.lovable.app"
                aria-label="App URL"
                className="min-w-0 flex-1 rounded-full border border-url-entry-border bg-url-entry px-5 py-3 text-base outline-none placeholder:text-muted-foreground sm:rounded-none sm:border-0 sm:border-l sm:border-url-entry-border sm:bg-transparent sm:pl-4"
              />
              <SubmitButton pendingLabel="Continuing…">Score it</SubmitButton>
            </div>
            <label className="mt-3 flex items-center gap-2 px-2 text-sm text-muted-foreground">
              <input name="demo" type="checkbox" className="h-4 w-4 accent-[var(--primary)]" />
              Seeded demo (controlled page — the URL above is ignored)
            </label>
          </form>
          {error && (
            <p role="alert" className="mt-4 max-w-xl rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="min-w-0 self-end py-4">
          <h2 className="mb-1 text-lg font-medium">Projects</h2>
          {projects.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">No projects yet — score your first site.</p>
          )}
          <div className="divide-y divide-border">
            {projects.map(p => {
              const latest = p.latestRun?.overall?.desktop;
              const score = latest?.cappedTotal;
              return (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <Button
                    variant="ghost"
                    asChild
                    className="h-auto min-w-0 flex-1 justify-between gap-4 rounded-none px-0 py-2 text-left hover:bg-transparent"
                  >
                    <Link href={`/projects/${p.id}`}>
                      <span className="min-w-0">
                        <span className="block truncate font-normal">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {p.source === 'controlled_demo' ? 'demo' : p.url}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {latest && (
                          <span className="text-sm text-muted-foreground">
                            {score !== null && score !== undefined
                              ? <><span className="font-semibold text-foreground">{score}</span>/100</>
                              : `${latest.assessedCriteria}/10 assessed`}
                            {latest.band ? ` · ${latest.band.split('.')[0]}` : ''}
                            {p.latestRun?.overall?.sample ? ' · SAMPLE' : ''}
                            {latest.capApplied ? ' · gate fail' : ''}
                          </span>
                        )}
                        <ArrowUpRight className="text-muted-foreground" />
                      </span>
                    </Link>
                  </Button>
                  <form action={archiveProjectAction.bind(null, p.id)}>
                    <SubmitButton variant="ghost" pendingLabel="Archiving…">Archive</SubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
