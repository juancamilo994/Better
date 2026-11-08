'use client';

import { useEffect, useRef, useState } from 'react';
import type { OrbProps, OrbSide } from '@/lib/orb';
import type { OrbEngine } from './engine';

// 3D "shape of the score": smooth chrome when the rubric is happy, lumps and
// thorns where points are lost. Drop-in: give it orbProps(runs, run, ...) from
// lib/orb. three.js loads lazily on the client; if WebGL is unavailable the
// component renders nothing and the spider chart remains the source of truth.

/** Hover position is relative to the orb box, captured at event time (no ref reads during render). */
type Hover = { axis: number; orb: 0 | 1; x: number; y: number; w: number; h: number } | null;

const fmtPts = (p: number | null, max: number) => (p === null ? 'not assessed' : `${round1(p)} / ${max}`);
const round1 = (n: number) => (Math.round(n * 10) / 10).toString();

function headline(s: OrbSide) {
  return s.complete ? `${Math.round(s.earned)}` : `${Math.round(s.earned)}/${s.assessedMax}`;
}

function summary(axes: OrbProps['axes'], s: OrbSide) {
  const scored = axes.map((a, i) => ({ a, f: s.fractions[i] })).filter(x => x.f !== null) as { a: OrbProps['axes'][number]; f: number }[];
  const weakest = scored.sort((x, y) => x.f - y.f).slice(0, 2).map(x => x.a.title).join(' and ');
  const missing = axes.length - scored.length;
  return [
    s.complete ? `Score ${Math.round(s.earned)} of 100.` : `${Math.round(s.earned)} of ${s.assessedMax} assessed points; ${missing} axes not assessed.`,
    weakest ? `Roughest regions: ${weakest}.` : '',
    s.warning ? 'A verified deal-breaker failed.' : '',
  ].filter(Boolean).join(' ');
}

export function ScoreOrb({ axes, after, before, seed, className = '' }: OrbProps & { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const capRefs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const engineRef = useRef<OrbEngine | null>(null);
  const [compare, setCompare] = useState(!!before);
  const [hover, setHover] = useState<Hover>(null);
  const [unsupported, setUnsupported] = useState(false);
  const latest = useRef({ after, before, compare });
  useEffect(() => { latest.current = { after, before, compare }; });

  // Engine lifetime: recreated only if the axis count or site seed changes.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    let disposed = false;
    let engine: OrbEngine | null = null;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    const caps = capRefs.map(r => r.current);
    import('./engine').then(({ OrbEngine }) => {
      if (disposed) return;
      try {
        engine = new OrbEngine({
          canvas,
          axisCount: axes.length,
          seed,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          background: null,
          onHover: (h) => {
            if (!h) { setHover(null); return; }
            const r = wrap.getBoundingClientRect();
            setHover({ ...h, x: h.x - r.left, y: h.y - r.top, w: r.width, h: r.height });
          },
          onFrame: (anchors) => anchors.forEach((a, i) => {
            const el = caps[i];
            if (!el) return;
            el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, 0)`;
            el.style.opacity = a.visible ? '1' : '0';
          }),
        });
      } catch {
        setUnsupported(true);
        return;
      }
      engineRef.current = engine;
      const { after: a, before: b, compare: c } = latest.current;
      engine.setStates(a, b, true);
      engine.setCompare(c);
      ro = new ResizeObserver(([e]) => engine?.resize(e.contentRect.width, e.contentRect.height));
      ro.observe(wrap);
      io = new IntersectionObserver(([e]) => engine?.setActive(e.isIntersecting && !document.hidden));
      io.observe(wrap);
    });
    const onVis = () => engine?.setActive(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      ro?.disconnect();
      io?.disconnect();
      engine?.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [axes.length, seed]);

  useEffect(() => { engineRef.current?.setStates(after, before); }, [after, before]);
  useEffect(() => { engineRef.current?.setCompare(compare); }, [compare]);

  if (unsupported) return null;

  const showCompare = compare && !!before;
  const delta = showCompare && before && after.complete && before.complete ? Math.round(after.earned) - Math.round(before.earned) : null;
  const movers = showCompare && before
    ? axes.map((a, i) => {
        const p = after.points[i], q = before.points[i];
        if (p !== null && q !== null) return { a, d: p - q, kind: p > q ? 'up' : p < q ? 'down' : 'same' };
        if (p !== null && q === null) return { a, d: null, kind: 'new' };
        return null;
      }).filter((m): m is NonNullable<typeof m> => !!m && m.kind !== 'same')
        .sort((x, y) => (y.d === null ? 0.01 : Math.abs(y.d)) - (x.d === null ? 0.01 : Math.abs(x.d)))
        .slice(0, 4)
    : [];

  const tip = hover ? (() => {
    const ax = axes[hover.axis];
    const p = after.points[hover.axis];
    const q = before?.points[hover.axis] ?? null;
    let change: string | null = null;
    if (showCompare) {
      if (p !== null && q !== null) change = p === q ? 'No change' : `${p > q ? '+' : ''}${round1(p - q)} points`;
      else if (p !== null) change = 'Newly assessed';
      else if (q !== null) change = 'Not assessed in this run';
    }
    const f = after.fractions[hover.axis];
    const note = f === null ? 'No evidence scored yet, so the orb shows a grid instead of guessing.'
      : f >= 0.75 ? 'Passes its checks.' : f >= 0.25 ? 'Passes with a clear flaw.' : 'Main failure present.';
    return { ax, p, q, change, note, left: Math.min(hover.x + 14, hover.w - 276), top: Math.min(hover.y + 14, hover.h - 150) };
  })() : null;

  return (
    <figure className={`m-0 ${className}`} aria-label="Shape of the score">
      {before && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          {delta !== null && delta !== 0 && showCompare && (
            <span className="font-mono text-sm font-semibold text-primary">{delta > 0 ? '+' : ''}{delta} since {before.label}</span>
          )}
          <div role="group" aria-label="Orb view" className="inline-flex overflow-hidden rounded-full border border-border text-sm">
            <button type="button" onClick={() => setCompare(false)} aria-pressed={!compare}
              className={`px-3 py-1.5 ${!compare ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>This run</button>
            <button type="button" onClick={() => setCompare(true)} aria-pressed={compare}
              className={`border-l border-border px-3 py-1.5 ${compare ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>Before / After</button>
          </div>
        </div>
      )}

      <div ref={wrapRef} className={`relative w-full overflow-hidden rounded-[calc(var(--radius)-0.5rem)] ${showCompare ? 'h-[600px] sm:h-[420px]' : 'h-[400px]'}`}>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={showCompare && before ? `Before: ${summary(axes, before)} After: ${summary(axes, after)}` : summary(axes, after)}
          className="block h-full w-full cursor-grab"
          style={{ touchAction: 'pan-y' }}
        />
        {[after, before].map((s, i) => s && (
          <div key={i} ref={capRefs[i]} className="pointer-events-none absolute left-0 top-0 text-center whitespace-nowrap opacity-0 transition-opacity" aria-hidden>
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{i === 0 ? 'After' : 'Before'}</div>
            <div className="text-lg font-semibold text-foreground">{headline(s)}{s.complete && <span className="text-xs font-normal text-muted-foreground">/100</span>}</div>
            <div className="text-[11px] text-muted-foreground">{s.label}{s.complete ? '' : ' · partial'}</div>
          </div>
        ))}
        {tip && (
          <div className="pointer-events-none absolute z-10 w-[264px] rounded-2xl border border-border bg-popover/95 p-3 text-xs leading-relaxed text-popover-foreground shadow-lg"
            style={{ left: Math.max(8, tip.left), top: Math.max(8, tip.top) }}>
            <div className="flex justify-between gap-2 text-sm font-medium">
              <span>{tip.ax.title}</span>
              <span className="font-mono">
                {showCompare && before ? `${fmtPts(tip.q, tip.ax.max)} → ${fmtPts(tip.p, tip.ax.max)}` : fmtPts(tip.p, tip.ax.max)}
              </span>
            </div>
            {tip.ax.hint && <p className="mt-1 text-muted-foreground">{tip.ax.hint}</p>}
            <p className="mt-1">{tip.change ? <span className="font-semibold text-primary">{tip.change}</span> : tip.note}</p>
          </div>
        )}
      </div>

      {movers.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs" aria-label="Biggest changes">
          {movers.map(m => (
            <li key={m.a.id} className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
              {m.a.title} <span className={`font-semibold ${m.kind === 'down' ? 'text-destructive' : 'text-primary'}`}>
                {m.d === null ? 'new' : `${m.d > 0 ? '+' : ''}${round1(m.d)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <figcaption className="mt-3 text-xs text-muted-foreground">
        Smooth is strong; lumps and thorns are lost points; a grid means not assessed{after.warning || before?.warning ? '; glowing cracks mean a verified deal-breaker failed (warning only, score unchanged)' : ''}. Hover a region for detail, drag to spin.
        {showCompare && before && !(after.complete && before.complete) && ' Totals are not comparable until both runs are fully assessed; per-axis changes are.'}
      </figcaption>
    </figure>
  );
}
