import Link from 'next/link';
import { api } from '@/lib/harness';
import { startRunAction } from '@/lib/actions';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { project } = await api.getProject(id);

  return (
    <main>
      <p><Link href={`/projects/${id}`}>← {project.name}</Link></p>
      <h1>Set the brief</h1>
      <p>Who is this site for, what should it feel like, and what&apos;s the one job it must do? The swipe deck (visual taste cards) is being designed in Paper — for now, note liked and passed styles below.</p>

      <form action={startRunAction.bind(null, id)}>
        <label>One core job <input name="task" placeholder="Sign up for the beta" required maxLength={600} /></label>
        <label>Audience <input name="audience" placeholder="Indie founders" required maxLength={600} /></label>
        <label>Desired feeling <input name="feeling" placeholder="Confident and warm" required maxLength={600} /></label>
        <label>Liked styles (taste) <input name="taste" placeholder="Minimal & airy, Editorial" maxLength={1000} /></label>
        <label>Passed styles (avoid) <input name="avoid" placeholder="Dense dashboards" maxLength={1000} /></label>
        <label>Brand notes <input name="brand" placeholder="Optional" maxLength={1000} /></label>
        <button type="submit">Run first evaluation</button>
      </form>
    </main>
  );
}
