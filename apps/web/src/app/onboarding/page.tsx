import Link from 'next/link';
import { createProjectWithBriefAction } from '@/lib/actions';
import { SubmitButton } from '@/components/SubmitButton';
import { api } from '@/lib/harness';
import type { BriefSuggestion } from '@/lib/harness/types';

export const dynamic = 'force-dynamic';

// The brief (core job, audience, feeling) is suggested from the site itself, so
// the user only checks it and clicks once. Every field stays editable.
export default async function NewProjectOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; url?: string; error?: string }>;
}) {
  const { name: givenName, url, error } = await searchParams;
  if (!url) {
    return (
      <main>
        <p>Missing the site URL. <Link href="/">Back to projects</Link></p>
      </main>
    );
  }

  let suggestion: BriefSuggestion | null = null;
  let suggestionError: string | null = null;
  try {
    suggestion = await api.suggestBrief(url);
  } catch (e) {
    suggestionError = e instanceof Error ? e.message : 'Could not read the site.';
  }
  let host = url;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep the raw URL */ }
  const name = givenName || suggestion?.siteName || host;

  return (
    <main>
      <p><Link href="/">← Projects</Link></p>
      <h1>Check the brief, then run</h1>
      <p>{name} · {url}</p>
      {suggestion && (
        <p>
          We filled this in from the site{suggestion.description ? ` ("${suggestion.description}")` : ''}.
          {suggestion.source === 'keywords' ? ' This is a rough guess because the AI judge is off; check it.' : ' Change anything that’s off.'}
        </p>
      )}
      {suggestionError && <p role="status">We couldn&apos;t read the site to fill this in ({suggestionError}) Describe it below.</p>}
      {error && <p role="alert">{error}</p>}

      <form action={createProjectWithBriefAction}>
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="url" value={url} />
        <label>One core job <input name="task" defaultValue={suggestion?.task ?? ''} placeholder="Sign up for the beta" required maxLength={600} /></label>
        <label>Audience <input name="audience" defaultValue={suggestion?.audience ?? ''} placeholder="Indie founders" required maxLength={600} /></label>
        <label>Desired feeling <input name="feeling" defaultValue={suggestion?.feeling ?? ''} placeholder="Confident and warm" required maxLength={600} /></label>
        <details>
          <summary>Optional: taste and brand</summary>
          <label>Liked styles (taste) <input name="taste" placeholder="Minimal & airy, Editorial" maxLength={1000} /></label>
          <label>Passed styles (avoid) <input name="avoid" placeholder="Dense dashboards" maxLength={1000} /></label>
          <label>Brand notes <input name="brand" placeholder="Optional" maxLength={1000} /></label>
        </details>
        <SubmitButton pendingLabel="Creating + evaluating…" evaluating>Looks right: run the evaluation</SubmitButton>
      </form>
    </main>
  );
}
