import Link from 'next/link';
import { api } from '@/lib/harness';
import { reevaluateAction } from '@/lib/actions';
import { CopyButton } from '@/components/CopyButton';

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
  if (!run) return <main><p>No evaluation yet.</p></main>;

  const { handoffs } = await api.getRun(run.id);
  const handoff = handoffs.find(h => h.id === handoffId) ?? handoffs.at(-1);

  return (
    <main>
      <p><Link href={`/projects/${id}/recommendations?run=${run.id}`}>← Recommendations</Link></p>
      <h1>Prompt — {project.name}</h1>
      {!handoff ? (
        <p>No fixes selected yet. <Link href={`/projects/${id}/recommendations?run=${run.id}`}>Pick recommendations</Link></p>
      ) : (
        <>
          <p>{handoff.selectedIds.length} fix(es) selected · created {new Date(handoff.createdAt).toLocaleString()}</p>
          <CopyButton text={handoff.prompt} />
          <pre style={{ whiteSpace: 'pre-wrap', maxWidth: 720 }}>{handoff.prompt}</pre>
        </>
      )}
      <section>
        <h2>Applied the changes?</h2>
        <p>Once your agent ships a new version at the same URL, re-assess to see how the score moved.</p>
        <form action={reevaluateAction.bind(null, id)}>
          <button type="submit">Re-assess the URL</button>
        </form>
      </section>
    </main>
  );
}
