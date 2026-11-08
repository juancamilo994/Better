'use client';

import dynamic from 'next/dynamic';
import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import type { Scores } from '@/lib/globe-shape';

const Scene = dynamic(() => import('./ScoreGlobeScene'), { ssr: false });

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (onChange: () => void) => {
  const mq = window.matchMedia(reducedMotionQuery);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
};

/**
 * Elle's score globe on real run data. `current` is the active run's criterion
 * vector (0–100 each, unassessed = 100); `compare` optionally toggles against
 * the previous comparable run.
 */
export function ScoreGlobe({
  current,
  compare,
}: {
  current: Scores;
  compare?: { label: string; scores: Scores };
}) {
  const [showCompare, setShowCompare] = useState(false);
  const rotating = useSyncExternalStore(
    subscribeMotion,
    () => !window.matchMedia(reducedMotionQuery).matches,
    () => true,
  );
  const showingCompare = compare !== undefined && showCompare;
  const label = showingCompare ? compare.label : 'Current run';
  return (
    <div>
      <div className="relative aspect-square w-full" role="img" aria-label={`${label} — 3-D design score globe`}>
        <Scene scores={showingCompare ? compare.scores : current} rotating={rotating} />
      </div>
      {compare && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Globe run comparison">
            <Button variant={showingCompare ? 'secondary' : 'ghost'} size="sm" aria-pressed={showingCompare} onClick={() => setShowCompare(true)}>
              {compare.label}
            </Button>
            <Button variant={showingCompare ? 'ghost' : 'secondary'} size="sm" aria-pressed={!showingCompare} onClick={() => setShowCompare(false)}>
              Current run
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
