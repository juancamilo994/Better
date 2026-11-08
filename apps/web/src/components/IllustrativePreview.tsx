import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { PreviewModel } from '@/lib/preview';

// Illustrative preview: the captured screenshot with annotation boxes in
// percent coordinates (scales with the image). Measured boxes are solid,
// inferred boxes dashed — never presented as a live patch render.
function Frame({ preview }: { preview: PreviewModel }) {
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <div className="relative inline-block w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={preview.beforeUrl}
        alt={`${preview.viewport} capture with annotation overlays`}
        className="block w-full"
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
            outline: `2px ${a.confidence === 'measured' ? 'solid' : 'dashed'} ${
              a.confidence === 'measured' ? 'var(--accent)' : 'var(--muted-foreground)'
            }`,
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}

export function IllustrativePreview({ preview }: { preview: PreviewModel }) {
  return (
    <Dialog>
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Illustrative</span>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-foreground/5"
              aria-label="Expand preview"
              title="Expand preview"
            >
              <Maximize2 />
            </Button>
          </DialogTrigger>
        </div>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            className="h-auto w-full overflow-hidden rounded-md border border-border p-0 hover:bg-transparent"
            aria-label="Open preview"
          >
            <Frame preview={preview} />
          </Button>
        </DialogTrigger>
      </div>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-5xl overflow-y-auto bg-score-panel p-4 sm:p-6">
        <DialogHeader className="pr-7 text-left">
          <DialogTitle>Illustrative preview</DialogTitle>
          <DialogDescription>
            {preview.problem} → {preview.proposal}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-md border border-border">
          <Frame preview={preview} />
        </div>
        <p className="text-sm text-muted-foreground">
          Annotated {preview.viewport} capture — not a live patch render.
          {preview.note ? ` ${preview.note}` : ''}
        </p>
      </DialogContent>
    </Dialog>
  );
}
