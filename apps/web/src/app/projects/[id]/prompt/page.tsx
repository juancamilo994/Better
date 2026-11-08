import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/harness';
import { reevaluateAction } from '@/lib/actions';
import { CopyButton } from '@/components/CopyButton';
import { SubmitButton } from '@/components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function PromptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string; handoff?: string }>;
}) {
  const { id } = await params;
  const { run: runId, handoff: handoffId } = await searchParams;
  const { project, runs } = await api.getProject(id);
  const run = runs.find(r => r.id === runId) ?? runs.at(-1);
  if (!run) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
        <p className="text-sm text-muted-foreground">No evaluation yet.</p>
      </main>
    );
  }

  const { handoffs } = await api.getRun(run.id);
  const handoff = handoffs.find(h => h.id === handoffId) ?? handoffs.at(-1);
  const included = handoff ? run.suggestions.filter(s => handoff.selectedIds.includes(s.id)) : [];
  const excluded = handoff ? run.suggestions.filter(s => !handoff.selectedIds.includes(s.id)) : [];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
      <Link href={`/projects/${id}/recommendations?run=${run.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Recommendations
      </Link>
      <h1 className="text-4xl font-semibold leading-[1.12] tracking-normal sm:text-5xl">The prompt.</h1>
      <p className="mt-2 text-sm text-muted-foreground">{project.name} · agent-ready Markdown</p>

      {!handoff ? (
        <p className="mt-8 rounded-[var(--radius)] bg-score-panel px-5 py-4 text-sm text-muted-foreground shadow-device">
          No fixes selected yet.{' '}
          <Link href={`/projects/${id}/recommendations?run=${run.id}`} className="text-foreground underline">
            Pick recommendations
          </Link>
        </p>
      ) : (
        <div className="animate-rise mt-8 grid items-start gap-6 lg:grid-cols-[1fr_2fr]">
          <aside className="flex min-w-0 flex-col gap-6 self-start lg:sticky lg:top-6">
            <section className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
              <h2 className="text-lg font-medium">In this prompt</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {handoff.selectedIds.length} fix(es) · created {new Date(handoff.createdAt).toLocaleString()}
              </p>
              <ul className="mt-3 divide-y divide-border text-sm">
                {included.map(s => (
                  <li key={s.id} className="py-2">
                    <span className="font-medium">{s.label}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{s.priority} · {s.viewport}</span>
                  </li>
                ))}
              </ul>
            </section>

            {excluded.length > 0 && (
              <section className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
                <h2 className="text-lg font-medium">Not in this prompt</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Still on the table — left out so the change stays attributable.
                </p>
                <ul className="mt-3 divide-y divide-border text-sm text-muted-foreground">
                  {excluded.map(s => (
                    <li key={s.id} className="py-2">{s.label}</li>
                  ))}
                </ul>
              </section>
            )}

            <section className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
              <h2 className="text-lg font-medium">Applied the changes?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Once your agent ships a new version at the same URL, re-assess to see how the score moved.
              </p>
              <form action={reevaluateAction.bind(null, id)} className="mt-4">
                <SubmitButton variant="secondary" pendingLabel="Evaluating…" evaluating>
                  Re-assess the URL
                </SubmitButton>
              </form>
            </section>
          </aside>

          <section className="min-w-0 rounded-[var(--radius)] bg-score-panel p-6 shadow-device sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">Markdown</h2>
              <CopyButton text={handoff.prompt} />
            </div>
            <pre className="whitespace-pre-wrap rounded-xl border border-border bg-url-entry p-5 font-mono text-sm leading-relaxed">
              {handoff.prompt}
            </pre>
          </section>
        </div>
      )}
    </main>
  );
}
