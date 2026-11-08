'use client';

import { useFormStatus } from 'react-dom';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const VARIANTS = {
  primary:
    'rounded-full bg-score-action px-6 py-3 font-semibold text-accent-foreground shadow-none transition hover:bg-score-action hover:scale-105 disabled:pointer-events-none disabled:opacity-50',
  secondary:
    'rounded-full border border-border bg-score-panel px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-card disabled:pointer-events-none disabled:opacity-50',
  ghost: 'text-sm text-muted-foreground transition hover:text-foreground disabled:opacity-50',
} as const;

// Pending-aware submit button for server actions. Evaluations take ~1–2 min
// (capture + judging); the honest message matters more than the spinner.
export function SubmitButton({
  children,
  pendingLabel = 'Working…',
  evaluating = false,
  variant = 'primary',
}: {
  children: ReactNode;
  pendingLabel?: string;
  /** Long-running run: show the evaluating explanation. */
  evaluating?: boolean;
  variant?: keyof typeof VARIANTS;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      <button type="submit" disabled={pending} aria-busy={pending} className={cn(VARIANTS[variant])}>
        {pending ? pendingLabel : children}
      </button>
      {pending && evaluating && (
        <span role="status" className="block max-w-sm text-xs text-muted-foreground">
          Capturing the page, measuring checks and judging criteria — usually 1–2 minutes.
        </span>
      )}
    </>
  );
}
