import type { Artifact, ElementFact, Run, Suggestion, Viewport } from './harness/types';

// Illustrative-preview model: a before screenshot plus annotation boxes in
// screenshot pixel coordinates (captures are deviceScaleFactor 1, scrolled to
// top, so ElementFact x/y map 1:1 onto image pixels). The UI renders the image
// with absolutely-positioned overlays scaled to the rendered size.
//
// Deterministic criteria (rule + captured facts) produce 'measured' boxes —
// exact elements the check flagged. Visual findings produce, at best, an
// 'inferred' box from a heuristic, otherwise none: we never fabricate targets.
// When the harness ships live patch previews (TEAM Q-P7), this model gains a
// `mode: 'live'` sibling with an `afterUrl` image instead of annotations.

export interface PreviewAnnotation {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  elementId?: string;
  confidence: 'measured' | 'inferred';
}

export interface PreviewModel {
  mode: 'illustrative';
  viewport: Viewport;
  suggestionId: string;
  beforeUrl: string;
  fullPageUrl?: string;
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  /** What the fix addresses — the finding's observed problem. */
  problem: string;
  /** The proposed change text. */
  proposal: string;
  /** Set when no element-level targets could be identified. */
  note?: string;
}

type Annotation = PreviewAnnotation;

const MAX_ANNOTATIONS = 8;
const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'p', 'a', 'button', 'label', 'input', 'textarea', 'select', 'li']);
const PAD = 4;

function box(el: ElementFact, label: string, confidence: Annotation['confidence']): Annotation {
  return {
    x: Math.max(0, el.x - PAD),
    y: Math.max(0, el.y - PAD),
    width: el.width + PAD * 2,
    height: el.height + PAD * 2,
    label,
    elementId: el.id,
    confidence,
  };
}

function screenshotFor(run: Run, viewport: Viewport): { artifact: Artifact; capture: Run['captures'][number] } | null {
  const capture = run.captures.find(c => c.viewport === viewport && c.status === 'ready');
  const artifact = capture?.artifacts.find(a => a.kind === 'screenshot');
  return capture && artifact ? { artifact, capture } : null;
}

function fullPageFor(run: Run, viewport: Viewport): Artifact | undefined {
  return run.captures
    .find(c => c.viewport === viewport && c.status === 'ready')
    ?.artifacts.find(a => a.kind === 'full_screenshot');
}

function measuredAnnotations(run: Run, suggestion: Suggestion): Annotation[] {
  const criterion = run.rubric.criteria.find(c => c.id === suggestion.criterionId);
  const capture = run.captures.find(c => c.viewport === suggestion.viewport);
  if (!criterion || !capture) return [];
  const elements = capture.facts.elements;

  switch (criterion.rule) {
    case 'small-text': {
      const min = criterion.threshold ?? 0;
      return elements
        .filter(e => TEXT_TAGS.has(e.tag) && e.fontSize > 0 && e.fontSize < min)
        .map(e => box(e, `${Math.round(e.fontSize)}px < ${min}px`, 'measured'));
    }
    case 'overflow': {
      const limit = capture.facts.clientWidth;
      if (!limit) return [];
      return elements
        .filter(e => e.x + e.width > limit || e.x < 0)
        .map(e => box(e, 'extends past viewport', 'measured'));
    }
    case 'image-alt':
      return elements
        .filter(e => e.tag === 'img' && e.alt === null)
        .map(e => box(e, 'missing alt text', 'measured'));
    default:
      return [];
  }
}

function inferredAnnotations(run: Run, suggestion: Suggestion): Annotation[] {
  // Heuristic targets for visual findings without a deterministic rule.
  // Only where the finding's own example tag gives a sensible guess.
  const capture = run.captures.find(c => c.viewport === suggestion.viewport);
  if (!capture || suggestion.example !== 'hierarchy') return [];
  const candidates = capture.facts.elements
    .filter(e => (e.tag === 'button' || e.tag === 'a') && e.y < capture.height)
    .sort((a, b) => b.width * b.height - a.width * a.height);
  return candidates.slice(0, 1).map(e => box(e, 'likely primary action', 'inferred'));
}

export function buildPreview(
  run: Run,
  suggestion: Suggestion,
  evidenceUrl: (runId: string, evidenceId: string) => string,
): PreviewModel | null {
  const shot = screenshotFor(run, suggestion.viewport);
  if (!shot) return null;

  let annotations = measuredAnnotations(run, suggestion);
  let confidenceNote: string | undefined;
  if (annotations.length === 0) {
    annotations = inferredAnnotations(run, suggestion);
    if (annotations.length === 0) {
      confidenceNote = 'No element-level targets identified — read the proposal against the captured page.';
    }
  }
  if (annotations.length > MAX_ANNOTATIONS) {
    annotations = annotations
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .slice(0, MAX_ANNOTATIONS);
  }

  const full = fullPageFor(run, suggestion.viewport);
  return {
    mode: 'illustrative',
    viewport: suggestion.viewport,
    suggestionId: suggestion.id,
    beforeUrl: evidenceUrl(run.id, shot.artifact.id),
    fullPageUrl: full ? evidenceUrl(run.id, full.id) : undefined,
    imageWidth: shot.artifact.width ?? shot.capture.width,
    imageHeight: shot.artifact.height ?? shot.capture.height,
    annotations,
    problem: suggestion.problem,
    proposal: suggestion.change,
    note: confidenceNote,
  };
}

/** All previews for a run's suggestions, keyed by suggestion id. */
export function buildPreviews(
  run: Run,
  evidenceUrl: (runId: string, evidenceId: string) => string,
): Map<string, PreviewModel> {
  const map = new Map<string, PreviewModel>();
  for (const s of run.suggestions) {
    const model = buildPreview(run, s, evidenceUrl);
    if (model) map.set(s.id, model);
  }
  return map;
}
