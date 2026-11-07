import Link from 'next/link';
import { api } from '@/lib/harness';
import { SuggestionPicker } from '@/components/SuggestionPicker';

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
  if (!run) return <main><p>No evaluation yet. <Link href={`/projects/${id}/onboarding`}>Start onboarding</Link></p></main>;

  const axisTitle = new Map(run.rubric.axes.map(a => [a.id, a.title]));
  const byAxis = new Map<string, typeof run.suggestions>();
  for (const s of run.suggestions) {
    const axis = run.rubric.criteria.find(c => c.id === s.criterionId)?.axis ?? 'other';
    byAxis.set(axis, [...(byAxis.get(axis) ?? []), s]);
  }

  return (
    <main>
      <p><Link href={`/projects/${id}?run=${run.id}`}>← Score</Link></p>
      <h1>Recommendations — {project.name}</h1>
      <p>Pick up to 3 fixes (soft cap), then build the prompt for your agent.</p>

      <section>
        <h2>By criterion (placeholder for icon-navigated spider chart)</h2>
        {[...byAxis.entries()].map(([axis, items]) => (
          <details key={axis} open>
            <summary>{axisTitle.get(axis) ?? axis} ({items.length})</summary>
            <SuggestionPicker projectId={id} runId={run.id} suggestions={items} />
          </details>
        ))}
        {run.suggestions.length === 0 && <p>Nothing major to fix on this run.</p>}
      </section>

      <section aria-label="Preview">
        <h2>Before / after</h2>
        <p>Live patch previews are pending the harness decision (TEAM Q-P7). Until then, previews render as Illustrative from captured evidence.</p>
      </section>
    </main>
  );
}
