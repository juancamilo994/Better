// Mirrors harness/src/domain.ts (feat/better-evaluation-loop). When the
// harness contracts graduate to /contracts, replace this file with the
// approved schema-derived types.

export type Viewport = 'desktop' | 'mobile';
export type Channel = 'quality' | 'taste' | 'ai-isms' | 'motion' | 'reference';
export type Provenance = 'measured' | 'fixture' | 'subq' | 'unsupported';
export type ResultStatus = 'assessed' | 'not_assessed' | 'not_applicable' | 'failed';

export interface Profile {
  version: string;
  task: string;
  audience: string;
  feeling?: string;
  taste: string;
  avoid: string;
  brand: string;
}

export interface Finding {
  id: string;
  label: string;
  problem: string;
  change: string;
  effect: string;
  priority: 'high' | 'medium' | 'low';
  example?: 'hierarchy' | 'spacing' | 'type';
  dependencies: string[];
  conflicts: string[];
}

export interface Criterion {
  id: string;
  axis: string | null;
  title: string;
  channel: Channel;
  lane: 'deterministic' | 'visual' | 'unsupported';
  rule?: 'overflow' | 'small-text' | 'image-alt';
  threshold?: number;
  weight: number;
  instructions: string;
  requires: string[];
  anchors: string[];
  scoreValues?: number[];
  role?: 'points' | 'supporting';
  findings: Finding[];
}

export interface RubricAxis {
  id: string;
  title: string;
  weight?: number;
}

export interface CombinedPolicy {
  version: string;
  status: 'proposed';
  cap: number;
  bands: { min: number; max: number; label: string }[];
  unresolved: string[];
  issueCatalog: { id: string; home: string; description: string }[];
  feedbackTargetMs: number;
  feedbackDealBreakerMs: number;
  dealBreakers: { id: string; title: string; requires: 'runtime' | 'measurement' | 'matched_mobile_320' }[];
  pairwise: Record<string, unknown> & { enabled: false };
}

export interface Rubric {
  version: string;
  status: string;
  axes: RubricAxis[];
  criteria: Criterion[];
  combined?: CombinedPolicy;
}

export interface Artifact {
  id: string;
  runId: string;
  viewport: Viewport;
  state: 'default-frozen';
  kind: 'screenshot' | 'full_screenshot' | 'dom' | 'styles' | 'text';
  file: string;
  sha256: string;
  bytes: number;
  width?: number;
  height?: number;
}

export interface ElementFact {
  id: string;
  tag: string;
  text: string;
  fontSize: number;
  lineHeight: string;
  color: string;
  background: string;
  width: number;
  height: number;
  x: number;
  y: number;
  alt: string | null;
}

export interface Capture {
  viewport: Viewport;
  width: number;
  height: number;
  status: 'ready' | 'failed';
  reason?: string;
  url: string;
  capturedAt: string;
  state: 'default-frozen';
  artifacts: Artifact[];
  facts: {
    scrollWidth: number;
    clientWidth: number;
    elements: ElementFact[];
    text: string;
    title: string;
    truncated: boolean;
  };
  browser: string;
  contentHash: string;
  documentHash: string;
  blockedRequests: number;
}

export interface Result {
  criterionId: string;
  viewport: Viewport;
  channel: Channel;
  axis: string | null;
  status: ResultStatus;
  score: number | null;
  issueId?: string;
  provenance: Provenance;
  reason: string;
  evidenceIds: string[];
  findingId: string | null;
  confidence: number | null;
}

export interface Suggestion {
  id: string;
  runId: string;
  criterionId: string;
  viewport: Viewport;
  state: string;
  issueKey: string;
  label: string;
  problem: string;
  change: string;
  effect: string;
  priority: 'high' | 'medium' | 'low';
  provenance: Provenance;
  evidenceIds: string[];
  example?: 'hierarchy' | 'spacing' | 'type';
  dependencies: string[];
  conflicts: string[];
}

export interface AxisScore {
  axis: string;
  score: number | null;
  assessed: number;
  total: number;
  complete: boolean;
  fixture: boolean;
}

export interface DealBreakerObservation {
  id: string;
  applicable: boolean | null;
  verdict: 'pass' | 'fail' | 'unknown';
  verified: boolean;
  evidenceIds: string[];
  evidenceKind: 'runtime' | 'measurement' | 'matched_mobile_320' | 'static' | 'none';
}

export interface QualitySummary {
  policyVersion: string;
  policyStatus: 'proposed';
  criteria: { id: string; title: string; max: number; points: number | null; evidenceIds: string[]; reason: string }[];
  coverage: { assessedCriteria: number; totalCriteria: number; assessedWeight: number };
  observedSubtotal: number | null;
  rawTotal: number | null;
  dealBreakers: DealBreakerObservation[];
  capApplied: boolean;
  cap: number;
  cappedTotal: number | null;
  band: string | null;
  unresolved: string[];
}

export interface Run {
  id: string;
  projectId: string;
  parentRunId: string | null;
  createdAt: string;
  status: 'complete' | 'partial' | 'failed' | 'setup_needed';
  mode: 'fixture' | 'subq';
  buildLabel: string;
  source: 'public_url' | 'controlled_demo';
  rubric: Rubric;
  profile: Profile;
  versions: Record<string, string>;
  captures: Capture[];
  results: Result[];
  suggestions: Suggestion[];
  axes: Record<Viewport, AxisScore[]>;
  fixtureAxes: Record<Viewport, AxisScore[]>;
  quality?: Record<Viewport, QualitySummary>;
  /** Labeled SAMPLE points for the controlled demo — illustrative, not measured. */
  fixtureQuality?: Record<Viewport, QualitySummary>;
  /** Versioned evidence-check assessment (check registry); additive, shape may grow. */
  assessment?: Record<string, unknown>;
  manifest: {
    os: string;
    browser: string;
    readiness: string;
    expectedText: string | null;
    deviceScale: number;
    input: Record<Viewport, string>;
    state: string;
    capturedBuildHash: string;
    repositorySource: 'not_connected';
    referenceIds: string[];
  };
  judgeAttempts: { viewport: Viewport; criterionId: string; status: string; code: string }[];
}

export interface Project {
  id: string;
  name: string;
  url: string;
  source: 'public_url' | 'controlled_demo';
  createdAt: string;
  profile: Profile;
}

export interface Handoff {
  id: string;
  runId: string;
  createdAt: string;
  selectedIds: string[];
  deferredIds: string[];
  prompt: string;
}

export interface Correction {
  id: string;
  runId: string;
  criterionId: string;
  viewport: Viewport;
  createdAt: string;
  note: string;
}

export interface RunDetail {
  run: Run;
  handoffs: Handoff[];
  corrections: Correction[];
}

export interface ProjectDetail {
  project: Project;
  runs: Run[];
}

export interface CompareResult {
  baselineRunId: string;
  currentRunId: string;
  compatible: boolean;
  reasons: string[];
  deltas: {
    criterionId: string;
    viewport: Viewport;
    provenance: Provenance;
    delta: number | null;
    label: 'not_assessed' | 'illustrative_fixture_delta' | 'measured_delta' | 'uncalibrated_judge_delta';
  }[];
  failures: { criterionId: string; viewport: Viewport; evidenceIds: string[] }[];
}

export interface CreateProjectInput {
  name: string;
  url?: string;
  demo?: boolean;
  profile?: Partial<Profile>;
}

export interface CreateRunInput {
  buildLabel?: string;
  demoVersion?: 'baseline' | 'revised';
  expectedText?: string;
  profile?: Profile;
  useLatestRubric?: boolean;
}
