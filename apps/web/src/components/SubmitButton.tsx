'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';

// Pending-aware submit button for server actions. Evaluations take ~1–2 min
// (capture + judging); the honest message matters more than the spinner.
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
  evaluating = false,
}: {
  children: ReactNode;
  pendingLabel?: string;
  /** Long-running run: show the evaluating explanation. */
  evaluating?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? pendingLabel : children}
      </button>
      {pending && evaluating && (
        <span role="status">
          {' '}Capturing the page, measuring checks and judging criteria — usually 1–2 minutes.
        </span>
      )}
    </>
  );
}
