import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/harness';
import { SuggestionPicker, type SuggestionGroup } from '@/components/SuggestionPicker';
import { RadarChart } from '@/components/RadarChart';
import { ghostQuality } from '@/lib/history';
import { buildPreviews } from '@/lib/preview';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const { run: runId } = await searchParams;
  const { project, runs } = await api.getProject(id);
  const run = runs.find(r => r.id === runId) ?? runs.at(-1);
  if (!run) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
        <p className="text-sm text-muted-foreground">
          No evaluation yet. <Link href={`/projects/${id}/onboarding`} className="text-foreground underline">Start onboarding</Link>
        </p>
      </main>
    );
  }

  const byAxis = new Map<string, typeof run.suggestions>();
  for (const s of run.suggestions) {
    const axis = run.rubric.criteria.find(c => c.id === s.criterionId)?.axis ?? 'other';
    byAxis.set(axis, [...(byAxis.get(axis) ?? []), s]);
  }
  const groups: SuggestionGroup[] = [
    ...run.rubric.axes
      .filter(a => byAxis.has(a.id))
      .map(a => ({ key: a.id, title: a.title, items: byAxis.get(a.id)! })),
    ...(byAxis.has('other') ? [{ key: 'other', title: 'Other', items: byAxis.get('other')! }] : []),
  ];
  const previews = Object.fromEntries(buildPreviews(run, api.evidenceUrl));
  const ghost = ghostQuality(runs, run);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
      <Link href={`/projects/${id}?run=${run.id}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Score
      </Link>
      <h1 className="text-4xl font-semibold leading-[1.12] tracking-normal sm:text-5xl">Recommendations.</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {project.name} · pick up to 3 fixes (soft cap), then build the prompt for your agent.
      </p>

      <div className="animate-rise mt-8 grid items-start gap-6 lg:grid-cols-[1fr_2fr]">
        <aside className="flex min-w-0 flex-col gap-6 self-start lg:sticky lg:top-6">
          <div className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
            <RadarChart run={run} ghost={ghost} />
          </div>
          <nav aria-label="Fix groups" className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
            <h2 className="mb-1 text-sm font-medium text-muted-foreground">Jump to axis</h2>
            <div className="divide-y divide-border">
              {groups.map(g => (
                <Link
                  key={g.key}
                  href={`#axis-${g.key}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                >
                  <span className="min-w-0 truncate">{g.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{g.items.length}</span>
                </Link>
              ))}
            </div>
          </nav>
          <p className="px-2 text-xs text-muted-foreground">
            Live patch previews are pending the harness decision (TEAM Q-P7). Until then, previews render as Illustrative from captured evidence.
          </p>
        </aside>

        <div className="min-w-0">
          <SuggestionPicker projectId={id} runId={run.id} groups={groups} previews={previews} />
        </div>
      </div>
    </main>
  );
}
