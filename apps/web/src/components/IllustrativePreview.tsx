import type { PreviewModel } from '@/lib/preview';

// Functional placeholder rendering of an Illustrative preview: the captured
// screenshot with annotation boxes in percent coordinates (scales with the
// image). Visual design lands from Paper; keep markup semantic.
export function IllustrativePreview({ preview }: { preview: PreviewModel }) {
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <figure>
      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={preview.beforeUrl}
          alt={`${preview.viewport} capture with annotation overlays`}
          style={{ display: 'block', width: '100%' }}
        />
        {preview.annotations.map((a, i) => (
          <span
            key={i}
            title={a.label}
            data-confidence={a.confidence}
            style={{
              position: 'absolute',
              left: pct(a.x, preview.imageWidth),
              top: pct(a.y, preview.imageHeight),
              width: pct(a.width, preview.imageWidth),
              height: pct(a.height, preview.imageHeight),
              outline: `2px ${a.confidence === 'measured' ? 'solid' : 'dashed'} #d92d20`,
              outlineOffset: 1,
            }}
          />
        ))}
      </div>
      <figcaption>
        <span>Illustrative</span> — {preview.problem} → {preview.proposal}
        {preview.note && <span> {preview.note}</span>}
      </figcaption>
    </figure>
  );
}
