import Link from 'next/link';
import { api } from '@/lib/harness';
import { reevaluateAction } from '@/lib/actions';
import { RadarChart } from '@/components/RadarChart';
import type { Run } from '@/lib/harness/types';

export const dynamic = 'force-dynamic';

export default async function ScorePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id } = await params;
  const { run: runId } = await searchParams;
  const { project, runs } = await api.getProject(id);

  if (runs.length === 0) {
    return (
      <main>
        <h1>{project.name}</h1>
        <p>No evaluations yet.</p>
        <p><Link href={`/projects/${id}/onboarding`}>Finish onboarding to run the first evaluation</Link></p>
      </main>
    );
  }

  const run: Run = runs.find(r => r.id === runId) ?? runs[runs.length - 1];
  const previous = runs.filter(r => r.id !== run.id && new Date(r.createdAt) < new Date(run.createdAt)).at(-1);
  const quality = run.quality?.desktop;
  const mobileQuality = run.quality?.mobile;
  const band = quality?.band;
  const shot = run.captures.find(c => c.viewport === 'desktop' && c.status === 'ready')
    ?.artifacts.find(a => a.kind === 'screenshot');
  const unchanged = previous && previous.manifest.capturedBuildHash === run.manifest.capturedBuildHash;

  return (
    <main>
      <p><Link href="/">← Projects</Link></p>
      <h1>{project.name}</h1>
      <p>{run.captures[0]?.url ?? project.url} · run {run.id.slice(0, 8)} · {run.status} · {new Date(run.createdAt).toLocaleString()}</p>

      {run.status === 'setup_needed' && (
        <p role="alert">Setup needed: a real judge provider isn&apos;t configured, so visual criteria were not scored. Captures and measured checks still ran.</p>
      )}
      {run.status === 'failed' && <p role="alert">Evaluation failed — the page could not be captured. <Link href={`/projects/${id}`}>See run list</Link></p>}
      {unchanged && <p>The captured page is unchanged since the previous run; score differences are evaluator variance, not real change.</p>}

      <section aria-label="Overall score">
        <h2>Overall (desktop)</h2>
        <p>
          {quality?.cappedTotal ?? quality?.observedSubtotal ?? '—'} / 100
          {band ? ` — ${band}` : ''}
        </p>
        {quality && quality.coverage.assessedCriteria < quality.coverage.totalCriteria && (
          <p>{quality.coverage.assessedCriteria}/{quality.coverage.totalCriteria} criteria assessed — gaps are unknown, not zero.</p>
        )}
        {quality?.capApplied && <p>Deal-breaker cap applied (max {quality.cap}).</p>}
        {mobileQuality && <p>Mobile: {mobileQuality.cappedTotal ?? mobileQuality.observedSubtotal ?? '—'} / 100{mobileQuality.band ? ` — ${mobileQuality.band}` : ''}</p>}
      </section>

      <RadarChart run={run} />

      <section aria-label="Score by criterion">
        <h2>By criterion</h2>
        <ul>
          {quality?.criteria.map(c => (
            <li key={c.id}>{c.title}: {c.points ?? 'not assessed'} / {c.max}</li>
          ))}
        </ul>
      </section>

      {quality && quality.dealBreakers.length > 0 && (
        <section aria-label="Deal breakers">
          <h2>Deal-breakers</h2>
          <ul>
            {quality.dealBreakers.map(d => (
              <li key={d.id}>{d.id}: {d.verdict}{d.verified ? '' : ' (unverified)'}</li>
            ))}
          </ul>
        </section>
      )}

      {shot && (
        <figure>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={api.evidenceUrl(run.id, shot.id)} alt="Captured desktop screenshot" style={{ maxWidth: 720, width: '100%' }} />
          <figcaption>Captured {run.captures.find(c => c.viewport === 'desktop')?.capturedAt}</figcaption>
        </figure>
      )}

      <section aria-label="History">
        <h2>Runs ({runs.length})</h2>
        <ul>
          {runs.map(r => (
            <li key={r.id}>
              <Link href={`/projects/${id}?run=${r.id}`}>
                {new Date(r.createdAt).toLocaleString()} — {r.status} — desktop {r.quality?.desktop.cappedTotal ?? '—'}/100
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <nav>
        <Link href={`/projects/${id}/recommendations?run=${run.id}`}>See recommendations →</Link>
        <form action={reevaluateAction.bind(null, id)} style={{ display: 'inline' }}>
          <button type="submit">Re-assess</button>
        </form>
      </nav>
    </main>
  );
}
