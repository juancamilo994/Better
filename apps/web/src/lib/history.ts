import type { QualitySummary, Run, Viewport } from './harness/types';

// Run-history helpers: score extraction, comparability and deltas, computed
// locally from the runs already returned by GET /api/projects/:id. No extra
// harness calls — deltas the UI shows are plain arithmetic.

/** Headline score for a run on a viewport: capped when a cap applied, else observed subtotal. */
export function runScore(run: Run, viewport: Viewport = 'desktop'): number | null {
  const q = run.quality?.[viewport] ?? run.fixtureQuality?.[viewport];
  return q?.cappedTotal ?? q?.observedSubtotal ?? null;
}

/** Runs are comparable only when every versioned input matches (Paul's rule). */
export function versionsEqual(a: Run, b: Run): boolean {
  const va = a.versions ?? {};
  const vb = b.versions ?? {};
  const keys = new Set([...Object.keys(va), ...Object.keys(vb)]);
  for (const k of keys) if (va[k] !== vb[k]) return false;
  return true;
}

/** The most recent earlier run comparable to `run`, or null. */
export function previousComparable(runs: Run[], run: Run): Run | null {
  const earlier = runs
    .filter(r => r.id !== run.id && new Date(r.createdAt) < new Date(run.createdAt))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return earlier.find(r => versionsEqual(r, run)) ?? null;
}

export type Delta = { value: number | null; comparable: boolean };

/** Delta of run's headline score vs the previous comparable run. */
export function scoreDelta(runs: Run[], run: Run, viewport: Viewport = 'desktop'): Delta {
  const prev = previousComparable(runs, run);
  if (!prev) return { value: null, comparable: false };
  const cur = runScore(run, viewport);
  const base = runScore(prev, viewport);
  return { value: cur !== null && base !== null ? cur - base : null, comparable: true };
}

/** Ghost series for the radar: the previous comparable run's quality. */
export function ghostQuality(runs: Run[], run: Run): Record<Viewport, QualitySummary> | undefined {
  const prev = previousComparable(runs, run);
  return prev ? (prev.quality ?? prev.fixtureQuality) : undefined;
}
