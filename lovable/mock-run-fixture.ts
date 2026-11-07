import type { Handoff, Project, ProjectDetail, Result, Rubric, Run, RunDetail, Suggestion } from './types';

// DEV-ONLY fixtures for BETTER_MOCK_MODE — shaped like real Combined-rubric
// harness output so the UI can be built without a running harness or paid
// judge calls. Never served to users; mock mode is opt-in via env var.

const AXIS_MAX: [string, string, number][] = [
  ['HIER', 'Hierarchy', 12],
  ['DENSITY', 'Information density', 12],
  ['FLOW', 'Flow & effort', 10],
  ['INTERACTION', 'Interaction & feedback', 12],
  ['AUDIENCE', 'Audience & tone fit', 12],
  ['ORIGINALITY', 'Originality', 10],
  ['VISUAL', 'Visual communication', 10],
  ['SYSTEM', 'System consistency', 8],
  ['TYPOGRAPHY', 'Typography', 6],
  ['USABILITY', 'Usability basics', 8],
];

const points = (id: string, axis: string, title: string, scoreValues: number[]): import('./types').Criterion => ({
  id, axis, title, channel: 'quality', lane: 'visual', role: 'points', weight: 1,
  instructions: `Judge ${title.toLowerCase()} using the configured anchors.`,
  requires: ['screenshot', 'text'], anchors: scoreValues.map(v => `Anchor for ${v} points.`),
  scoreValues,
  findings: [{ id: `${axis}_IMPROVE`, label: `Improve ${title.toLowerCase()}`, problem: `Weak ${title.toLowerCase()} detected.`, change: `Address the evidenced ${title.toLowerCase()} issue.`, effect: `May improve ${title.toLowerCase()}.`, priority: 'medium', dependencies: [], conflicts: [] }],
});

export const fixtureRubric: Rubric = {
  version: 'elle-combined-proposed-2026-11-07.2',
  status: 'Proposed Combined rubric (fixture copy)',
  axes: AXIS_MAX.map(([id, title, weight]) => ({ id, title, weight })),
  criteria: AXIS_MAX.map(([id, title, max]) => points(`${id}-POINTS`, id, title, [0, max / 2, max])),
  combined: {
    version: 'elle-combined-proposed-2026-11-07.2', status: 'proposed', cap: 49,
    bands: [
      { min: 90, max: 100, label: 'Distinctive and effortless. Ship it.' },
      { min: 75, max: 89, label: 'Strong, with fixable flaws.' },
      { min: 60, max: 74, label: 'Works, but generic or effortful.' },
      { min: 40, max: 59, label: 'Real problems users will feel.' },
      { min: 0, max: 39, label: 'Fails its audience. Rethink, don\'t polish.' },
    ],
    unresolved: ['Fixture rubric: calibration pending.'],
    issueCatalog: AXIS_MAX.map(([id]) => ({ id, home: id, description: `${id} issue` })),
    feedbackTargetMs: 100, feedbackDealBreakerMs: 400,
    dealBreakers: [
      { id: 'BODY_CONTRAST', title: 'Body text contrast at least 4.5:1', requires: 'measurement' },
      { id: 'TARGETS', title: 'Tap targets and spacing', requires: 'runtime' },
      { id: 'FOCUS', title: 'Visible focus states', requires: 'runtime' },
      { id: 'COLOR_ONLY', title: 'Meaning does not depend on color alone', requires: 'measurement' },
      { id: 'REFLOW_320', title: 'No horizontal scrolling at 320px', requires: 'matched_mobile_320' },
    ],
    pairwise: { enabled: false },
  },
};

export const fixtureProject: Project = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Acme landing page',
  url: 'https://example.com/',
  source: 'public_url',
  createdAt: '2026-11-07T12:00:00.000Z',
  profile: {
    version: 'profile-1', task: 'Sign up for the beta', audience: 'Indie founders',
    feeling: 'Confident and warm', taste: 'Minimal & airy, Editorial', avoid: 'Dense dashboards', brand: '',
  },
};

function mkResult(criterionId: string, axis: string, viewport: 'desktop' | 'mobile', score: number | null, findingId: string | null): Result {
  return {
    criterionId, viewport, channel: 'quality', axis,
    status: score === null ? 'not_assessed' : 'assessed', score,
    provenance: score === null ? 'subq' : 'subq',
    reason: score === null ? 'Judge abstained: insufficient evidence.' : 'Fixture judgment.',
    evidenceIds: score === null ? [] : [`fixture-run:${viewport}:screenshot`],
    findingId, confidence: 0.82,
  };
}

const DESKTOP_SCORES: Record<string, number | null> = {
  HIER: 6, DENSITY: 12, FLOW: 5, INTERACTION: 12, AUDIENCE: 12,
  ORIGINALITY: 5, VISUAL: 10, SYSTEM: 8, TYPOGRAPHY: 6, USABILITY: null,
};
const MOBILE_SCORES: Record<string, number | null> = {
  HIER: 6, DENSITY: 12, FLOW: 5, INTERACTION: 6, AUDIENCE: 12,
  ORIGINALITY: 5, VISUAL: 5, SYSTEM: 8, TYPOGRAPHY: 6, USABILITY: null,
};

function mkSuggestions(runId: string): Suggestion[] {
  const out: Suggestion[] = [];
  for (const [viewport, scores] of [['desktop', DESKTOP_SCORES], ['mobile', MOBILE_SCORES]] as const) {
    for (const [axis, title] of AXIS_MAX.map(([id, t]) => [id, t] as const)) {
      const score = scores[axis];
      if (score !== null && score < (AXIS_MAX.find(([id]) => id === axis)![2] / 2)) {
        out.push({
          id: `${runId}:${viewport}:${axis}_IMPROVE`, runId, criterionId: `${axis}-POINTS`, viewport,
          state: 'default-frozen', issueKey: `${viewport}:${axis}_IMPROVE`,
          label: `Improve ${title.toLowerCase()}`, problem: `Weak ${title.toLowerCase()} detected on ${viewport}.`,
          change: `Address the evidenced ${title.toLowerCase()} issue on ${viewport}.`,
          effect: `Hypothesis, not measured: may improve ${title.toLowerCase()}.`,
          priority: 'high', provenance: 'subq', evidenceIds: [`fixture-run:${viewport}:screenshot`],
          dependencies: [], conflicts: [],
        });
      }
    }
  }
  return out;
}

export function fixtureRun(id: string, projectId: string, variant: 'first' | 'second' = 'first'): Run {
  const desktop = { ...DESKTOP_SCORES };
  const mobile = { ...MOBILE_SCORES };
  if (variant === 'second') { desktop.HIER = 12; desktop.FLOW = 10; mobile.FLOW = 10; }
  const buildQuality = (viewport: 'desktop' | 'mobile', scores: Record<string, number | null>) => {
    const criteria = AXIS_MAX.map(([axis, title, max]) => {
      const points = scores[axis];
      return {
        id: axis, title, max,
        points,
        evidenceIds: points === null ? [] : [`${id}:${viewport}:screenshot`],
        reason: points === null ? 'Insufficient evidence.' : 'Fixture judgment.',
      };
    });
    const assessed = criteria.filter(c => c.points !== null);
    const subtotal = assessed.reduce((s, c) => s + c.points!, 0);
    const complete = assessed.length === criteria.length;
    const raw = complete ? subtotal : null;
    return {
      policyVersion: fixtureRubric.combined!.version, policyStatus: 'proposed' as const,
      criteria, coverage: { assessedCriteria: assessed.length, totalCriteria: criteria.length, assessedWeight: assessed.reduce((s, c) => s + c.max, 0) },
      observedSubtotal: subtotal, rawTotal: raw,
      dealBreakers: fixtureRubric.combined!.dealBreakers.map(d => ({
        id: d.id, applicable: null, verdict: 'unknown' as const, verified: false, evidenceIds: [], evidenceKind: 'none' as const,
      })),
      capApplied: false, cap: 49, cappedTotal: raw,
      band: raw === null ? null : (fixtureRubric.combined!.bands.find(b => raw >= b.min && raw <= b.max)?.label ?? null),
      unresolved: ['Fixture data: coverage is partial, totals are observed-only.'],
    };
  };
  const results = AXIS_MAX.flatMap(([axis]) =>
    (['desktop', 'mobile'] as const).map(v => mkResult(`${axis}-POINTS`, axis, v, (v === 'desktop' ? desktop : mobile)[axis], ((v === 'desktop' ? desktop : mobile)[axis] ?? 99) < 6 ? `${axis}_IMPROVE` : null)),
  );
  const axesOf = (viewport: 'desktop' | 'mobile', scores: Record<string, number | null>) =>
    AXIS_MAX.map(([axis]) => ({ axis, score: scores[axis], assessed: scores[axis] === null ? 0 : 1, total: 1, complete: scores[axis] !== null, fixture: false }));
  const base = variant === 'first' ? '2026-11-07T12:30:00.000Z' : '2026-11-07T14:30:00.000Z';
  return {
    id, projectId, parentRunId: variant === 'first' ? null : 'fixture-run-1',
    createdAt: base, status: 'partial', mode: 'subq', buildLabel: 'fixture build',
    source: 'public_url', rubric: fixtureRubric, profile: fixtureProject.profile,
    versions: { rubric: 'fixture', profile: 'fixture', judge: 'fixture', prompt: 'fixture', capture: 'fixture', aggregation: 'fixture' },
    captures: (['desktop', 'mobile'] as const).map(v => ({
      viewport: v, width: v === 'desktop' ? 1440 : 390, height: v === 'desktop' ? 900 : 844,
      status: 'ready' as const, url: fixtureProject.url, capturedAt: base, state: 'default-frozen' as const,
      artifacts: [
        { id: `${id}:${v}:screenshot`, runId: id, viewport: v, state: 'default-frozen' as const, kind: 'screenshot' as const, file: `${v}.png`, sha256: 'x', bytes: 0, width: v === 'desktop' ? 1440 : 390, height: v === 'desktop' ? 900 : 844 },
        { id: `${id}:${v}:full_screenshot`, runId: id, viewport: v, state: 'default-frozen' as const, kind: 'full_screenshot' as const, file: `${v}.full.png`, sha256: 'x', bytes: 0 },
      ],
      facts: { scrollWidth: 0, clientWidth: 0, elements: [], text: '', title: 'Fixture page', truncated: false },
      browser: 'fixture', contentHash: `hash-${variant}-${v}`, documentHash: `doc-${variant}`,
      blockedRequests: 0,
    })),
    results, suggestions: mkSuggestions(id),
    axes: { desktop: axesOf('desktop', desktop), mobile: axesOf('mobile', mobile) },
    fixtureAxes: { desktop: [], mobile: [] },
    quality: { desktop: buildQuality('desktop', desktop), mobile: buildQuality('mobile', mobile) },
    manifest: {
      os: 'fixture', browser: 'fixture', readiness: 'fixture', expectedText: null, deviceScale: 1,
      input: { desktop: 'pointer', mobile: 'touch-emulated' }, state: 'default-frozen',
      capturedBuildHash: `hash-${variant}`, repositorySource: 'not_connected', referenceIds: [],
    },
    judgeAttempts: [],
  };
}

export const fixtureProjectDetail: ProjectDetail = {
  project: fixtureProject,
  runs: [fixtureRun('fixture-run-1', fixtureProject.id, 'first'), fixtureRun('fixture-run-2', fixtureProject.id, 'second')],
};

export function fixtureRunDetail(id: string): RunDetail {
  const run = fixtureProjectDetail.runs.find(r => r.id === id) ?? fixtureProjectDetail.runs[0];
  const handoff: Handoff = {
    id: 'fixture-handoff-1', runId: run.id, createdAt: '2026-11-07T12:45:00.000Z',
    selectedIds: run.suggestions.slice(0, 2).map(s => s.id), deferredIds: [],
    prompt: '# Improve the UI of Acme landing page\n\nImplement only the selected Better suggestions below.\n\n- Improve hierarchy [desktop]\n- Improve flow & effort [desktop, mobile]',
  };
  return { run, handoffs: [handoff], corrections: [] };
}
