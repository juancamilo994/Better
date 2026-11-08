import { buildRadar } from './radar';
import { previousComparable } from './history';
import type { QualitySummary, Run, Viewport } from './harness/types';

// Server-safe adapter: turns harness runs into plain, serializable props for
// <ScoreOrb>. Axis order, maxima and fractions come from buildRadar so the orb
// and the spider chart always agree. Unassessed axes stay null (a gap, not zero).

export interface OrbAxisInfo {
  id: string;
  title: string;
  max: number;
  /** One-line description of what the axis judges (first finding's problem text). */
  hint: string | null;
}

export interface OrbSide {
  fractions: (number | null)[];
  points: (number | null)[];
  /** Verified deal-breaker failure: drawn as fault lines, never changes the score. */
  warning: boolean;
  /** Earned points over assessed axes and their max; complete when every axis is assessed. */
  earned: number;
  assessedMax: number;
  complete: boolean;
  label: string;
  sample: boolean;
}

export interface OrbProps {
  axes: OrbAxisInfo[];
  after: OrbSide;
  before: OrbSide | null;
  seed: string;
}

function side(run: Run, viewport: Viewport, source: Record<Viewport, QualitySummary> | undefined, measured: Run, label: string, sample: boolean): OrbSide {
  const series = buildRadar(run, [viewport], source).series[0];
  // Deal-breakers are measured, never sample: read them from the measured run.
  const quality = measured.quality?.[viewport];
  const assessed = series.vertices.filter(v => v.points !== null);
  return {
    fractions: series.vertices.map(v => v.fraction),
    points: series.vertices.map(v => v.points),
    warning: !!quality?.capApplied,
    earned: assessed.reduce((s, v) => s + (v.points ?? 0), 0),
    assessedMax: assessed.reduce((s, v) => s + v.max, 0),
    complete: assessed.length === series.vertices.length,
    label,
    sample,
  };
}

const stamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Orb props for `run`, compared against the previous comparable run (same
 * versioned inputs, per lib/history) when one exists.
 */
export function orbProps(runs: Run[], run: Run, opts: { viewport?: Viewport; seed: string }): OrbProps {
  const viewport = opts.viewport ?? 'desktop';
  const radar = buildRadar(run, [viewport], run.fixtureQuality);
  // Axis max = the quality entry's points max (rubric criterion weights are per-criterion, not points).
  const axes = radar.axes.map((a, i) => ({
    id: a.id,
    title: a.title,
    max: radar.series[0].vertices[i].max,
    hint: run.rubric.criteria.find(c => c.axis === a.id)?.findings[0]?.problem ?? null,
  }));
  // Demo runs carry labeled sample points in fixtureQuality; the page shows them flagged as sample.
  const after = side(run, viewport, run.fixtureQuality, run, stamp(run.createdAt), !!run.fixtureQuality);
  const prev = previousComparable(runs, run);
  const before = prev ? side(run, viewport, prev.fixtureQuality ?? prev.quality, prev, stamp(prev.createdAt), !!prev.fixtureQuality) : null;
  return { axes, after, before, seed: opts.seed };
}
