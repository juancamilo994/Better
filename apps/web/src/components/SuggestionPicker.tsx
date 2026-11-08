'use client';

import { useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { createHandoffAction } from '@/lib/actions';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Suggestion } from '@/lib/harness/types';
import type { PreviewModel } from '@/lib/preview';
import { IllustrativePreview } from './IllustrativePreview';

export interface SuggestionGroup {
  /** Stable group key — rubric axis id or 'other'. */
  key: string;
  title: string;
  items: Suggestion[];
}

// Suggestions rendered in Elle's "design options" card rhythm: tap a card to
// add it to the prompt tray; a selected card expands into problem → change →
// expected effect plus its Illustrative preview. Groups come from the rubric
// (axis titles), never hard-coded.
export function SuggestionPicker({
  projectId,
  runId,
  groups,
  previews = {},
}: {
  projectId: string;
  runId: string;
  groups: SuggestionGroup[];
  previews?: Record<string, PreviewModel>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const overCap = selected.size > 3;
  const total = groups.reduce((n, g) => n + g.items.length, 0);

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      {groups.map(group => (
        <section key={group.key} id={`axis-${group.key}`} className="flex flex-col gap-2">
          <h2 className="px-2 text-sm font-medium text-muted-foreground">
            {group.title} <span className="opacity-70">({group.items.length})</span>
          </h2>
          <div className="flex flex-col gap-2">
            {group.items.map(s => {
              const preview = previews[s.id];
              const active = selected.has(s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    'relative overflow-hidden rounded-[var(--radius)] text-left shadow-device transition-all',
                    active ? 'bg-score-panel ring-2 ring-primary' : 'bg-score-panel',
                  )}
                >
                  <Button
                    variant="ghost"
                    onClick={() => toggle(s.id)}
                    aria-pressed={active}
                    className="h-auto w-full items-start justify-between gap-4 whitespace-normal rounded-none p-5 text-left hover:bg-transparent"
                  >
                    <div className="min-w-0">
                      <p className="text-lg font-semibold leading-tight">{s.label}</p>
                      <p className="text-sm opacity-70">{s.problem}</p>
                      {active && (
                        <p className="mt-3 max-w-md text-sm opacity-90">
                          {s.change}
                          {s.effect ? (
                            <span className="mt-1 block text-muted-foreground">Expected: {s.effect}</span>
                          ) : null}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {s.priority} · {s.viewport}
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
                          active ? 'bg-primary text-primary-foreground' : 'bg-score-action text-accent-foreground',
                        )}
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        {active ? 'In prompt' : 'Add'}
                      </span>
                      {s.provenance === 'fixture' && (
                        <span className="text-xs text-muted-foreground">SAMPLE</span>
                      )}
                    </div>
                  </Button>
                  {active && preview && (
                    <div className="px-5 pb-5">
                      <IllustrativePreview preview={preview} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {total === 0 && (
        <p className="rounded-[var(--radius)] bg-score-panel px-5 py-4 text-sm text-muted-foreground shadow-device">
          Nothing major to fix on this run.
        </p>
      )}

      <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-full border border-border bg-score-panel/95 px-5 py-3 shadow-device backdrop-blur">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{selected.size}</span> selected
          {overCap && (
            <span className="ml-2 text-destructive">
              We recommend ≤3 fixes per run so you can see what moved the score.
            </span>
          )}
        </p>
        <Button
          type="button"
          disabled={selected.size === 0}
          className="h-auto shrink-0 rounded-full bg-score-action px-6 py-2.5 font-semibold text-accent-foreground shadow-none hover:bg-score-action hover:scale-105"
          onClick={async () => {
            setError(null);
            try {
              await createHandoffAction(projectId, runId, [...selected]);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not create the handoff.');
            }
          }}
        >
          Build the prompt
        </Button>
      </div>
      {error && <p role="alert" className="px-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
