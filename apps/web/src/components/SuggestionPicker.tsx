'use client';

import { useState } from 'react';
import { createHandoffAction } from '@/lib/actions';
import type { Suggestion } from '@/lib/harness/types';
import type { PreviewModel } from '@/lib/preview';
import { IllustrativePreview } from './IllustrativePreview';

export function SuggestionPicker({
  projectId,
  runId,
  suggestions,
  previews = {},
}: {
  projectId: string;
  runId: string;
  suggestions: Suggestion[];
  previews?: Record<string, PreviewModel>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const overCap = selected.size > 3;

  return (
    <div>
      <p>{selected.size} selected {overCap && <strong>— we recommend at most 3 fixes per run so you can see what moved the score</strong>}</p>
      {error && <p role="alert">{error}</p>}
      <ul>
        {suggestions.map(s => {
          const preview = previews[s.id];
          // Surface what the measured checks actually flagged — element-level
          // evidence we already compute for the overlay boxes.
          const measured = preview?.annotations.filter(a => a.confidence === 'measured') ?? [];
          const counts = new Map<string, number>();
          for (const a of measured) counts.set(a.label, (counts.get(a.label) ?? 0) + 1);
          const evidence = [...counts].map(([l, n]) => `${l} ×${n}`).join(' · ');
          return (
            <li key={s.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={e => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(s.id); else next.delete(s.id);
                    setSelected(next);
                  }}
                />
                <strong>{s.label}</strong> [{s.viewport} · {s.priority}]
                {s.provenance === 'fixture' && ' · SAMPLE'}
                <br />
                <small>{s.problem}</small>
                {evidence && <><br /><small>Evidence: {evidence}</small></>}
              </label>
              {preview && <IllustrativePreview preview={preview} />}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={selected.size === 0}
        onClick={async () => {
          setError(null);
          try {
            await createHandoffAction(projectId, runId, [...selected]);
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not create the handoff.');
          }
        }}
      >
        Add to prompt
      </button>
    </div>
  );
}
