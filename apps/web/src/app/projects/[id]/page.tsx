import Link from 'next/link';
import { api } from '@/lib/harness';
import { reevaluateAction } from '@/lib/actions';
import { RadarChart } from '@/components/RadarChart';
import { SubmitButton } from '@/components/SubmitButton';
import { ghostQuality, scoreDelta } from '@/lib/history';
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
  // Demo runs carry labeled sample points in fixtureQuality — show them for
  // the chart/criterion list, flagged as sample. Measured deal-breakers and
  // coverage still come from real quality.
  const sample = run.fixtureQuality;
  const displayQuality = sample?.desktop ?? quality;
  const displayMobile = sample?.mobile ?? mobileQuality;
  const band = displayQuality?.band;
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
        <h2>Overall (desktop){sample && ' — sample'}</h2>
        <p>
          {displayQuality?.cappedTotal ?? displayQuality?.observedSubtotal ?? '—'} / 100
          {band ? ` — ${band}` : ''}
        </p>
        {sample && <p><small>Sample scores — illustrative, not measured.</small></p>}
        {displayQuality && displayQuality.coverage.assessedCriteria < displayQuality.coverage.totalCriteria && (
          <p>{displayQuality.coverage.assessedCriteria}/{displayQuality.coverage.totalCriteria} criteria assessed — gaps are unknown, not zero.</p>
        )}
        {displayQuality?.capApplied && (
          <p>
            Deal-breaker cap applied (max {displayQuality.cap})
            {displayQuality.rawTotal !== null && displayQuality.rawTotal !== displayQuality.cappedTotal
              ? ` — raw score before cap: ${displayQuality.rawTotal}/100`
              : ''}.
          </p>
        )}
        {displayMobile && (
          <p>
            Mobile: {displayMobile.cappedTotal ?? displayMobile.observedSubtotal ?? '—'} / 100
            {displayMobile.capApplied && displayMobile.rawTotal !== null && displayMobile.rawTotal !== displayMobile.cappedTotal
              ? ` (raw ${displayMobile.rawTotal})`
              : ''}
            {displayMobile.band ? ` — ${displayMobile.band}` : ''}
          </p>
        )}
      </section>

      <RadarChart run={run} qualitySource={sample} sample={!!sample} ghost={ghostQuality(runs, run)} />

      <section aria-label="Score by criterion">
        <h2>By criterion</h2>
        <ul>
          {displayQuality?.criteria.map(c => (
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

      {quality?.layer3 && (
        <section aria-label="Detector review">
          <h2>Detector review <small>{quality.layer3.coverage.covered}/{quality.layer3.coverage.total} checks ran</small></h2>
          {quality.layer3.review?.topFixes && quality.layer3.review.topFixes.length > 0 && (
            <ul>
              {quality.layer3.review.topFixes.map((f, i) => (
                <li key={i}><strong>[{f.priority}]</strong> {f.label}{f.detail ? ` — ${f.detail}` : ''}</li>
              ))}
            </ul>
          )}
          {quality.layer3.strengths && quality.layer3.strengths.length > 0 && (
            <p>Kept as strengths: {quality.layer3.strengths.join(' · ')}</p>
          )}
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
          {runs.map(r => {
            const d = scoreDelta(runs, r);
            const score = r.overall?.desktop?.cappedTotal
              ?? r.quality?.desktop.cappedTotal ?? r.quality?.desktop.observedSubtotal
              ?? r.fixtureQuality?.desktop.cappedTotal ?? r.fixtureQuality?.desktop.observedSubtotal;
            const raw = r.overall?.desktop?.rawTotal ?? r.quality?.desktop.rawTotal ?? r.fixtureQuality?.desktop.rawTotal;
            return (
              <li key={r.id}>
                <Link href={`/projects/${id}?run=${r.id}`}>
                  {new Date(r.createdAt).toLocaleString()} — {r.status} — desktop {score ?? '—'}/100
                  {raw !== null && raw !== undefined && score !== null && raw !== score ? ` (raw ${raw})` : ''}
                </Link>
                {d.value !== null && <strong> ({d.value > 0 ? '+' : ''}{d.value})</strong>}
                {!d.comparable && r.id !== run.id && <small> (not comparable)</small>}
              </li>
            );
          })}
        </ul>
      </section>

      <nav>
        <Link href={`/projects/${id}/recommendations?run=${run.id}`}>See recommendations →</Link>
        <form action={reevaluateAction.bind(null, id)} style={{ display: 'inline' }}>
          <SubmitButton pendingLabel="Evaluating…" evaluating>Re-assess</SubmitButton>
        </form>
      </nav>
    </main>
  );
}
