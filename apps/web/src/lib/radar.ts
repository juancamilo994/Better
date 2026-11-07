import type { Run, Viewport } from './harness/types';

// Spider/radar geometry for the run's rubric axes. Axis order and weights
// come from the rubric snapshot, never hard-coded. Unassessed axes stay
// gaps: their vertex is null and the path breaks around them rather than
// drawing to center (a zero would lie).

export interface RadarAxis {
  id: string;
  title: string;
  index: number;
  /** Sum of criterion weights under this axis — the axis's max score. */
  max: number;
}

export interface RadarVertex {
  axisIndex: number;
  /** 0..1 fraction of axis max earned; null when unassessed. */
  fraction: number | null;
  /** Assessed criteria under this axis / total criteria. */
  assessed: number;
  total: number;
  points: number | null;
  max: number;
}

export interface RadarSeries {
  viewport: Viewport;
  vertices: RadarVertex[];
  /** True when at least one axis is fully or partially unassessed. */
  partial: boolean;
  /** Contiguous runs of assessed axis indices for path drawing. */
  segments: number[][];
  total: { score: number; max: number };
}

export interface RadarChart {
  axes: RadarAxis[];
  series: RadarSeries[];
}

export function buildRadar(run: Run, viewports: Viewport[] = ['desktop', 'mobile']): RadarChart {
  const axes: RadarAxis[] = run.rubric.axes.map((a, i) => ({
    id: a.id,
    title: a.title,
    index: i,
    max: run.rubric.criteria
      .filter(c => c.axis === a.id)
      .reduce((sum, c) => sum + (c.weight ?? 0), 0),
  }));

  const series = viewports.map(viewport => {
    const quality = run.quality?.[viewport];
    const vertices: RadarVertex[] = axes.map(axis => {
      // Quality criteria are keyed by AXIS id (e.g. 'HIER'), not criterion id —
      // the harness collapses each axis's points criterion into one entry.
      const entry = quality?.criteria.find(q => q.id === axis.id);
      const points = entry?.points ?? null;
      const max = entry?.max ?? axis.max;
      return {
        axisIndex: axis.index,
        fraction: points === null || max === 0 ? null : points / max,
        assessed: points !== null ? 1 : 0,
        total: 1,
        points,
        max,
      };
    });

    // Segments: contiguous assessed runs. A gap splits the ring, so rotate
    // the walk to start just after the first gap — one linear pass suffices.
    const full = vertices.every(v => v.fraction !== null);
    const segments: number[][] = [];
    if (full) {
      segments.push(vertices.map(v => v.axisIndex));
    } else {
      const firstGap = vertices.findIndex(v => v.fraction === null);
      const order = vertices.map((_, i) => (i + firstGap + 1) % vertices.length);
      let cur: number[] = [];
      for (const i of order) {
        if (vertices[i].fraction === null) {
          if (cur.length) segments.push(cur);
          cur = [];
        } else {
          cur.push(i);
        }
      }
      if (cur.length) segments.push(cur);
    }

    return {
      viewport,
      vertices,
      partial: vertices.some(v => v.assessed < v.total),
      segments,
      total: {
        score: quality?.cappedTotal ?? quality?.observedSubtotal ?? 0,
        max: vertices.reduce((s, v) => s + v.max, 0),
      },
    };
  });

  return { axes, series };
}

/** Point on the chart for axis i at radius fraction `f`. */
export function vertexPoint(i: number, n: number, f: number, radius: number, cx: number, cy: number): [number, number] {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n; // axis 0 at top, clockwise
  return [cx + radius * f * Math.cos(angle), cy + radius * f * Math.sin(angle)];
}

/** SVG path for a series: one closed polygon when full, open polylines around gaps. */
export function seriesPath(series: RadarSeries, n: number, radius: number, cx: number, cy: number): string {
  const parts: string[] = [];
  for (const seg of series.segments) {
    const pts = seg.map(i => {
      const f = series.vertices[i].fraction ?? 0;
      const [x, y] = vertexPoint(i, n, f, radius, cx, cy);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    if (pts.length === 0) continue;
    const closed = seg.length === n; // full ring → close the polygon
    parts.push(`M${pts.join(' L')}${closed ? ' Z' : ''}`);
  }
  return parts.join(' ');
}
