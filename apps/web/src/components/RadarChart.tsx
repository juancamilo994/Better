import { buildRadar, seriesPath, vertexPoint, type RadarChart as RadarData } from '@/lib/radar';
import type { QualitySummary, Run, Viewport } from '@/lib/harness/types';

// Functional shell: correct geometry and honest gaps; Paper decides the look.
const SIZE = 340;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const R = 108;
const LABEL_R = R + 30;

const SERIES_COLOR = { desktop: '#2563eb', mobile: '#0d9488' } as const;

export function RadarChart({
  run,
  qualitySource,
  sample = false,
  ghost,
}: {
  run: Run;
  qualitySource?: Record<Viewport, QualitySummary>;
  sample?: boolean;
  /** Previous comparable run's quality — drawn as a dashed ghost polygon. */
  ghost?: Record<Viewport, QualitySummary>;
}) {
  const chart: RadarData = buildRadar(run, undefined, qualitySource);
  const ghostChart: RadarData | null = ghost ? buildRadar(run, undefined, ghost) : null;
  const n = chart.axes.length;
  if (n === 0) return null;

  const ring = (f: number) =>
    chart.axes.map((_, i) => vertexPoint(i, n, f, R, CX, CY).map(v => v.toFixed(1)).join(',')).join(' ');

  return (
    <figure>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Score by rubric axis">
        {[0.25, 0.5, 0.75, 1].map(f => (
          <polygon key={f} points={ring(f)} fill="none" stroke="#e5e7eb" strokeWidth="1" />
        ))}
        {chart.axes.map((a, i) => {
          const [x, y] = vertexPoint(i, n, 1, R, CX, CY);
          return <line key={a.id} x1={CX} y1={CY} x2={x} y2={y} stroke="#e5e7eb" strokeWidth="1" />;
        })}
        {ghostChart?.series.map(s => s.segments.length > 0 && (
          <path
            key={`ghost-${s.viewport}`}
            d={seriesPath(s, n, R, CX, CY)}
            fill="none"
            stroke="#9ca3af"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        ))}
        {chart.series.map(s => s.segments.length > 0 && (
          <path
            key={s.viewport}
            d={seriesPath(s, n, R, CX, CY)}
            fill={SERIES_COLOR[s.viewport]}
            fillOpacity={s.segments.length === 1 && !s.partial ? 0.15 : 0.08}
            stroke={SERIES_COLOR[s.viewport]}
            strokeWidth="1.5"
            strokeDasharray={s.partial ? '5 3' : undefined}
          />
        ))}
        {chart.series.map(s =>
          s.vertices.map(v => {
            if (v.fraction === null) return null;
            const [x, y] = vertexPoint(v.axisIndex, n, v.fraction, R, CX, CY);
            return <circle key={`${s.viewport}-${v.axisIndex}`} cx={x} cy={y} r="2.5" fill={SERIES_COLOR[s.viewport]} />;
          }),
        )}
        {chart.axes.map((a, i) => {
          const [x, y] = vertexPoint(i, n, 1, LABEL_R, CX, CY);
          const anchor = x < CX - 10 ? 'end' : x > CX + 10 ? 'start' : 'middle';
          const desk = chart.series[0]?.vertices[i];
          const label = desk && desk.points !== null ? `${desk.points}/${a.max}` : '—';
          return (
            <text key={a.id} x={x} y={y} fontSize="10" textAnchor={anchor} fill="#374151">
              <tspan fontWeight="600">{a.title}</tspan>
              <tspan x={x} dy="12" fill={label === '—' ? '#9ca3af' : '#6b7280'}>{label}</tspan>
            </text>
          );
        })}
      </svg>
      <figcaption>
        {chart.series.map(s => (
          <span key={s.viewport}>
            <span style={{ color: SERIES_COLOR[s.viewport] }}>■</span> {s.viewport} {s.total.score}/{s.total.max}
            {s.partial && ' (gaps)'}
          </span>
        ))}
        {ghostChart && <span> · dashed = previous comparable run</span>}
        {sample && <span> · Sample data — illustrative, not measured</span>}
      </figcaption>
    </figure>
  );
}
