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
        {suggestions.map(s => (
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
            </label>
            {previews[s.id] && <IllustrativePreview preview={previews[s.id]} />}
          </li>
        ))}
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
