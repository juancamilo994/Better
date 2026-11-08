import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/harness';
import { reevaluateAction } from '@/lib/actions';
import { ScoreOrb } from '@/components/orb/ScoreOrb';
import { orbProps } from '@/lib/orb';
import { SubmitButton } from '@/components/SubmitButton';
import { Button } from '@/components/ui/button';
import { ghostQuality, previousComparable, runScore, scoreDelta } from '@/lib/history';
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
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold">{project.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">No evaluations yet.</p>
        <p className="mt-2 text-sm">
          <Link href={`/projects/${id}/onboarding`} className="underline">
            Finish onboarding to run the first evaluation
          </Link>
        </p>
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

  const delta = scoreDelta(runs, run);
  const previousRun = previousComparable(runs, run);
  const previousScore = previousRun ? runScore(previousRun) : null;
  const ghost = ghostQuality(runs, run);

  const headline = run.overall?.desktop?.cappedTotal ?? displayQuality?.cappedTotal ?? displayQuality?.observedSubtotal;
  const mobileHeadline = run.overall?.mobile?.cappedTotal ?? displayMobile?.cappedTotal ?? displayMobile?.observedSubtotal;
  const ghostByCriterion = new Map(ghost?.desktop?.criteria.map(c => [c.id, c.points]) ?? []);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
      <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      {run.status === 'setup_needed' && (
        <p role="alert" className="mb-4 rounded-2xl bg-secondary/30 px-4 py-3 text-sm text-secondary-foreground">
          Setup needed: a real judge provider isn&apos;t configured, so visual criteria were not scored. Captures and measured checks still ran.
        </p>
      )}
      {run.status === 'failed' && (
        <p role="alert" className="mb-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Evaluation failed — the page could not be captured.
        </p>
      )}
      {unchanged && (
        <p className="mb-4 rounded-2xl bg-secondary/30 px-4 py-3 text-sm text-secondary-foreground">
          The captured page is unchanged since the previous run; score differences are evaluator variance, not real change.
        </p>
      )}

      <section className="animate-rise grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="min-w-0 self-start">
          <div className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device sm:p-8">
            <div className="flex items-end justify-between gap-6">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Score for</p>
                <p className="truncate text-xl font-normal">{run.captures[0]?.url ?? project.url}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-7xl font-medium tracking-display">
                  {headline ?? '—'}
                  <span className="text-3xl text-muted-foreground">/100</span>
                </span>
                <p className="text-sm text-muted-foreground">
                  {band ?? 'partial coverage'}
                  {delta.value !== null && (
                    <>
                      {' · '}
                      <span className="font-semibold text-primary">
                        from {previousScore ?? '—'} · {delta.value > 0 ? '+' : ''}{delta.value}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {project.name} · run {run.id.slice(0, 8)} · {run.status} · {new Date(run.createdAt).toLocaleString()}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {displayMobile && (
                <span>
                  Mobile: {mobileHeadline ?? '—'}/100{run.overall?.mobile?.band ?? displayMobile.band ? ` — ${run.overall?.mobile?.band ?? displayMobile.band}` : ''}
                </span>
              )}
              {sample && <span>Sample scores — illustrative, not measured.</span>}
              {displayQuality && displayQuality.coverage.assessedCriteria < displayQuality.coverage.totalCriteria && (
                <span>
                  {displayQuality.coverage.assessedCriteria}/{displayQuality.coverage.totalCriteria} criteria assessed — gaps are unknown, not zero.
                </span>
              )}
              {displayQuality?.capApplied && (
                <span role="alert" className="font-medium text-destructive">
                  Verified deal-breaker failure — flagged as a warning; the score is unchanged.
                </span>
              )}
            </div>
            <div className="mt-4">
              <ScoreOrb {...orbProps(runs, run, { seed: project.url })} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-5">
              {displayQuality?.criteria.map(c => {
                const was = ghostByCriterion.get(c.id);
                const diff = c.points !== null && was !== null && was !== undefined ? c.points - was : null;
                return (
                  <div key={c.id} className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">{c.title}</p>
                    <p className="text-lg font-semibold">
                      {c.points !== null ? c.points : '—'}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">/ {c.max}</span>
                      {diff !== null && diff !== 0 && (
                        <span className="ml-1 text-xs font-semibold text-primary">
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      )}
                    </p>
                    {c.points === null && <p className="text-xs text-muted-foreground">not assessed</p>}
                  </div>
                );
              })}
            </div>

            <nav className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                className="h-auto rounded-full bg-score-action px-6 py-3 font-semibold text-accent-foreground shadow-none transition hover:bg-score-action hover:scale-105"
              >
                <Link href={`/projects/${id}/recommendations?run=${run.id}`}>See recommendations</Link>
              </Button>
              <form action={reevaluateAction.bind(null, id)}>
                <SubmitButton variant="secondary" pendingLabel="Evaluating…" evaluating>
                  Re-assess
                </SubmitButton>
              </form>
            </nav>
          </div>

          <section aria-labelledby="by-criterion-title" className="px-2 pt-8 sm:px-4">
            <h2 id="by-criterion-title" className="mb-2 text-lg font-medium">By criterion</h2>
            <p className="mb-5 text-xs text-muted-foreground">
              Weighted points per rubric axis; unassessed criteria are gaps, not zeros.
            </p>
            <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
              {displayQuality?.criteria.map(c => (
                <div key={c.id} className="border-t border-border pt-3">
                  <dt className="mb-1 flex items-baseline justify-between gap-2 text-sm font-semibold">
                    {c.title}
                    <span className="shrink-0 text-xs font-normal text-muted-foreground">
                      {c.points !== null ? `${c.points} / ${c.max}` : 'not assessed'}
                    </span>
                  </dt>
                  <dd className="text-sm leading-relaxed text-muted-foreground">{c.reason}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6 self-start">
          {shot && (
            <figure className="overflow-hidden rounded-[var(--radius)] bg-score-panel shadow-device">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={api.evidenceUrl(run.id, shot.id)} alt="Captured desktop screenshot" className="block w-full" />
              <figcaption className="px-4 py-3 text-xs text-muted-foreground">
                Captured {run.captures.find(c => c.viewport === 'desktop')?.capturedAt}
              </figcaption>
            </figure>
          )}

          {quality && quality.dealBreakers.length > 0 && (
            <section aria-label="Deal breakers" className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
              <h2 className="text-lg font-medium">Deal-breakers</h2>
              <ul className="mt-3 divide-y divide-border text-sm">
                {quality.dealBreakers.map(d => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{d.id}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {d.verdict}{d.verified ? '' : ' (unverified)'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {quality?.layer3 && (
            <section aria-label="Detector review" className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
              <h2 className="text-lg font-medium">
                Detector review{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  {quality.layer3.coverage.covered}/{quality.layer3.coverage.total} checks ran
                </span>
              </h2>
              {quality.layer3.review?.topFixes && quality.layer3.review.topFixes.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {quality.layer3.review.topFixes.map((f, i) => (
                    <li key={i}>
                      <strong className="text-xs uppercase tracking-wide">[{f.priority}]</strong> {f.label}
                      {f.detail ? <span className="text-muted-foreground"> — {f.detail}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {quality.layer3.strengths && quality.layer3.strengths.length > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">Kept as strengths: {quality.layer3.strengths.join(' · ')}</p>
              )}
            </section>
          )}

          <section aria-label="History" className="rounded-[var(--radius)] bg-score-panel p-6 shadow-device">
            <h2 className="mb-1 text-lg font-medium">Runs ({runs.length})</h2>
            <div className="divide-y divide-border">
              {runs.map(r => {
                const d = scoreDelta(runs, r);
                const score = r.overall?.desktop?.cappedTotal
                  ?? r.quality?.desktop.cappedTotal ?? r.quality?.desktop.observedSubtotal
                  ?? r.fixtureQuality?.desktop.cappedTotal ?? r.fixtureQuality?.desktop.observedSubtotal;
                const raw = r.overall?.desktop?.rawTotal ?? r.quality?.desktop.rawTotal ?? r.fixtureQuality?.desktop.rawTotal;
                const isCurrent = r.id === run.id;
                return (
                  <Button
                    key={r.id}
                    variant="ghost"
                    asChild
                    className="h-auto w-full justify-between gap-4 rounded-none px-0 py-2 text-left hover:bg-transparent"
                  >
                    <Link href={`/projects/${id}?run=${r.id}`} aria-current={isCurrent ? 'true' : undefined}>
                      <span className="min-w-0 truncate text-sm font-normal">
                        {new Date(r.createdAt).toLocaleString()} — {r.status}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2 text-sm">
                        <span className={isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                          {score ?? '—'}/100
                          {raw !== null && raw !== undefined && score !== null && raw !== score ? ` (raw ${raw})` : ''}
                        </span>
                        {d.value !== null && (
                          <span className="text-xs font-semibold text-primary">
                            {d.value > 0 ? '+' : ''}{d.value}
                          </span>
                        )}
                        {!d.comparable && !isCurrent && <span className="text-xs text-muted-foreground">(not comparable)</span>}
                      </span>
                    </Link>
                  </Button>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
