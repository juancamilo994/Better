import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createProjectWithBriefAction } from '@/lib/actions';
import { SubmitButton } from '@/components/SubmitButton';

export const dynamic = 'force-dynamic';

const FIELD =
  'w-full rounded-full border border-url-entry-border bg-url-entry px-5 py-3 text-base outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40';

export default async function NewProjectOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; url?: string; error?: string }>;
}) {
  const { name, url, error } = await searchParams;
  if (!name || !url) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-8">
        <p className="text-sm text-muted-foreground">
          Missing project details. <Link href="/" className="text-foreground underline">Back to projects</Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 pb-16 sm:px-8">
      <div className="animate-rise mx-auto mt-10 max-w-xl rounded-[var(--radius)] bg-score-panel p-6 shadow-device sm:p-8">
        <Link href="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Projects
        </Link>
        <h1 className="text-4xl font-semibold leading-[1.12] tracking-normal sm:text-5xl">Set the brief.</h1>
        <p className="mt-3 truncate text-sm text-muted-foreground">{name} — {url}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Who is this site for, what should it feel like, and what&apos;s the one job it must do?
          The swipe deck (visual taste cards) is being designed — for now, note liked and passed styles below.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>
        )}

        <form action={createProjectWithBriefAction} className="mt-8 flex flex-col gap-4">
          <input type="hidden" name="name" value={name} />
          <input type="hidden" name="url" value={url} />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            One core job
            <input name="task" placeholder="Sign up for the beta" required maxLength={600} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Audience
            <input name="audience" placeholder="Indie founders" required maxLength={600} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Desired feeling
            <input name="feeling" placeholder="Confident and warm" required maxLength={600} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            Liked styles (taste)
            <input name="taste" placeholder="Minimal & airy, Editorial" maxLength={1000} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            Passed styles (avoid)
            <input name="avoid" placeholder="Dense dashboards" maxLength={1000} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            Brand notes
            <input name="brand" placeholder="Optional" maxLength={1000} className={FIELD} />
          </label>
          <div className="mt-2">
            <SubmitButton pendingLabel="Creating + evaluating…" evaluating>
              Create project &amp; run first evaluation
            </SubmitButton>
          </div>
        </form>
      </div>
    </main>
  );
}
