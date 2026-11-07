import Link from 'next/link';
import { createProjectWithBriefAction } from '@/lib/actions';
import { SubmitButton } from '@/components/SubmitButton';

export const dynamic = 'force-dynamic';

export default async function NewProjectOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; url?: string; error?: string }>;
}) {
  const { name, url, error } = await searchParams;
  if (!name || !url) {
    return (
      <main>
        <p>Missing project details. <Link href="/">Back to projects</Link></p>
      </main>
    );
  }

  return (
    <main>
      <p><Link href="/">← Projects</Link></p>
      <h1>Set the brief</h1>
      <p>{name} — {url}</p>
      <p>Who is this site for, what should it feel like, and what&apos;s the one job it must do? The swipe deck (visual taste cards) is being designed in Paper — for now, note liked and passed styles below.</p>
      {error && <p role="alert">{error}</p>}

      <form action={createProjectWithBriefAction}>
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="url" value={url} />
        <label>One core job <input name="task" placeholder="Sign up for the beta" required maxLength={600} /></label>
        <label>Audience <input name="audience" placeholder="Indie founders" required maxLength={600} /></label>
        <label>Desired feeling <input name="feeling" placeholder="Confident and warm" required maxLength={600} /></label>
        <label>Liked styles (taste) <input name="taste" placeholder="Minimal & airy, Editorial" maxLength={1000} /></label>
        <label>Passed styles (avoid) <input name="avoid" placeholder="Dense dashboards" maxLength={1000} /></label>
        <label>Brand notes <input name="brand" placeholder="Optional" maxLength={1000} /></label>
        <SubmitButton pendingLabel="Creating + evaluating…" evaluating>Create project &amp; run first evaluation</SubmitButton>
      </form>
    </main>
  );
}
