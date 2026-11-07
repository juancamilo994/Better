import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { platform, release } from 'node:os';
import { capturePage, VIEWPORTS } from '../capture/capture.ts';
import { type DemoVersion } from '../capture/demo.ts';
import { AGGREGATION_VERSION, CAPTURE_VERSION, PROMPT_VERSION, hash, loadRubric, objectHash } from '../config.ts';
import { AppError, type Capture, type Profile, type Result, type Run } from '../domain.ts';
import { FixtureJudge } from '../judges/fixture.ts';
import { JudgeError, validateDecision, type Judge, type JudgeInput } from '../judges/interface.ts';
import { SubQJudge } from '../judges/subq.ts';
import { Store } from '../store.ts';
import { combinedQuality } from './quality.ts';
import { dealBreakerObservations } from './dealbreakers.ts';
import { aggregate } from './aggregation.ts';
import { deterministic, missingEvidence, unassessed } from './checks.ts';
import { buildAssessment, groundedSuggestions, loadCheckRegistry, reconciledScores } from './evidence.ts';
import { explain } from './explanations.ts';

export interface EvaluateOptions {
  buildLabel?: string; demoVersion?: DemoVersion; expectedText?: string;
  profile?: Profile; useLatestRubric?: boolean; useLatestChecks?: boolean;
}
export function configuredJudge(): Judge {
  const mode = process.env.BETTER_JUDGE || 'fixture';
  if (mode === 'fixture') return new FixtureJudge();
  if (mode !== 'subq') throw new AppError('BETTER_JUDGE must be fixture or subq.', 500);
  return new SubQJudge({ apiKey: process.env.SUBQ_API_KEY, allowPaid: process.env.BETTER_ALLOW_PAID_CALLS === 'true', model: process.env.SUBQ_MODEL });
}

export async function evaluateProject(store: Store, projectId: string, options: EvaluateOptions = {}, judge: Judge = configuredJudge()): Promise<Run> {
  const project = store.project(projectId);
  const parent = store.runs(projectId).at(-1);
  const rubric = options.useLatestRubric || !parent ? loadRubric() : parent.rubric;
  const registry = rubric.combined ? (!options.useLatestChecks && parent?.assessment?.registry || loadCheckRegistry(rubric)) : undefined;
  const profile = options.profile ?? parent?.profile ?? project.profile;
  if (rubric.combined && (!profile.audience.trim() || !profile.task.trim() || !profile.feeling?.trim())) throw new AppError('Before evaluation, provide the audience, desired feeling and one core job.');
  const expectedText = options.expectedText ?? parent?.manifest.expectedText ?? undefined;
  const demoVersion = options.demoVersion ?? (parent?.buildLabel === 'revised' ? 'revised' : 'baseline');
  const id = randomUUID();
  const directory = join(store.directory, 'evidence', id);
  let captures: Capture[];
  try { captures = await capturePage(project, id, directory, demoVersion, expectedText); }
  catch {
    captures = Object.entries(VIEWPORTS).map(([viewport, dimensions]) => ({ viewport: viewport as 'desktop' | 'mobile', ...dimensions, status: 'failed', reason: 'Capture unavailable: destination blocked, browser missing, or navigation failed. No result was fabricated.', url: project.url, capturedAt: new Date().toISOString(), state: 'default-frozen', artifacts: [], facts: { scrollWidth: 0, clientWidth: 0, elements: [], text: '', title: '', truncated: false }, browser: 'unavailable', contentHash: '', documentHash: '', blockedRequests: 0 }));
  }
  const results: Result[] = [];
  const judgeAttempts: Run['judgeAttempts'] = [];
  for (const capture of captures) {
    const pair = captures.find(c => c.viewport !== capture.viewport);
    // First visual assessment receives page evidence and brief only, never detector results or pattern counts.
    for (const criterion of [...rubric.criteria].sort((a,b)=>Number(b.lane==='visual')-Number(a.lane==='visual'))) {
      if (rubric.combined && criterion.role === 'points' && !criterion.anchors.length) { results.push(unassessed(criterion, capture, 'Scoring policy unresolved: exact Combined rubric anchors have not been supplied.')); continue; }
      const missing = missingEvidence(criterion, capture, pair, profile);
      if (missing || criterion.lane === 'unsupported') {
        results.push(unassessed(criterion, capture, missing ?? 'Extension point: no supported verifier connected for this criterion.', capture.status === 'failed' ? 'failed' : 'not_assessed'));
        continue;
      }
      if (criterion.lane === 'deterministic') { results.push(deterministic(criterion, capture)); continue; }
      const input: JudgeInput = { criterion, capture, pairedCapture: pair, profile, source: project.source, demoVersion, issues: criterion.role === 'points' ? rubric.combined?.issueCatalog : undefined, images: [] };
      try {
        const sources = criterion.requires.includes('pair') ? [capture, pair!] : [capture];
        for (const source of sources) {
          const artifact = source.artifacts.find(a => a.kind === 'screenshot')!;
          const bytes = await readFile(join(directory, artifact.file));
          if (hash(bytes) !== artifact.sha256) throw new JudgeError('evidence_integrity_failed');
          input.images.push({ evidenceId: artifact.id, mediaType: 'image/png', base64: bytes.toString('base64') });
        }
        const result = validateDecision(await judge.evaluate(input), input, judge);
        results.push(result);
        judgeAttempts.push({ viewport: capture.viewport, criterionId: criterion.id, status: result.status, code: judge.provenance === 'fixture' ? 'labeled_fixture' : 'validated_response' });
      } catch (error) {
        const code = error instanceof JudgeError ? error.code : 'judge_failed';
        const setup = ['setup_needed', 'paid_calls_disabled'].includes(code);
        results.push({ ...unassessed(criterion, capture, code, setup ? 'not_assessed' : 'failed'), provenance: judge.provenance });
        judgeAttempts.push({ viewport: capture.viewport, criterionId: criterion.id, status: 'failed', code });
      }
    }
  }
  const setupNeeded = judgeAttempts.some(a => ['setup_needed', 'paid_calls_disabled'].includes(a.code)) || (project.source === 'public_url' && judge.provenance === 'fixture');
  const suggestions=explain(id,rubric,results);
  const assessment=registry?buildAssessment(registry,profile,captures,results,suggestions):undefined;
  const scoringResults=assessment?reconciledScores(results,assessment):results;
  // A run is complete when both captures succeeded and every points criterion
  // was assessed. Supporting checks and ledger states without a connected
  // verifier stay unknown by design, so they do not make every run partial.
  const pointsCriteria = rubric.criteria.filter(c => rubric.combined ? c.role === 'points' : c.channel === 'quality' && c.weight > 0);
  const pointsIncomplete = captures.some(c => c.status !== 'ready') || pointsCriteria.some(c => captures.some(capture => scoringResults.find(r => r.criterionId === c.id && r.viewport === capture.viewport)?.status !== 'assessed'));
  const quality = (fixtures: boolean) => ({ desktop: combinedQuality(rubric, scoringResults, 'desktop', dealBreakerObservations(captures, 'desktop'), fixtures), mobile: combinedQuality(rubric, scoringResults, 'mobile', dealBreakerObservations(captures, 'mobile'), fixtures) });
  const run: Run = {
    id, projectId, parentRunId: parent?.id ?? null, createdAt: new Date().toISOString(),
    status: captures.every(c => c.status === 'failed') ? 'failed' : setupNeeded ? 'setup_needed' : pointsIncomplete ? 'partial' : 'complete',
    mode: judge.provenance, buildLabel: project.source === 'controlled_demo' ? demoVersion : options.buildLabel ?? 'Unspecified build (see captured content hash)', source: project.source,
    rubric, profile,
    versions: { rubric: `${rubric.version}:${objectHash(rubric)}`, profile: `${profile.version}:${objectHash(profile)}`, judge: judge.version, prompt: PROMPT_VERSION, capture: `${CAPTURE_VERSION}:${objectHash({ viewports: VIEWPORTS, browser: captures[0]?.browser, os: `${platform()}-${release()}`, expectedText: expectedText ?? null })}`, aggregation: AGGREGATION_VERSION, ...(registry?{checks:`${registry.version}:${objectHash(registry)}`,reconciliation:'post-visual-1.0.0'}:{}) },
    captures, results, suggestions:assessment?groundedSuggestions(suggestions,assessment):suggestions, ...(assessment?{assessment}:{}),
    axes: { desktop: aggregate(rubric, scoringResults, 'desktop'), mobile: aggregate(rubric, scoringResults, 'mobile') },
    // Fixture points are summarized separately and always labeled sample data.
    ...(rubric.combined ? { quality: quality(false), ...(judge.provenance === 'fixture' ? { fixtureQuality: quality(true) } : {}) } : {}),
    fixtureAxes: { desktop: aggregate(rubric, scoringResults, 'desktop', true), mobile: aggregate(rubric, scoringResults, 'mobile', true) },
    manifest: { os: `${platform()}-${release()}`, browser: captures[0]?.browser ?? 'unavailable', readiness: 'GET-only; successful HTML; load plus bounded network idle; failed subresources counted, not fatal; fonts/images ready; optional text marker; freeze scripts/animations; identical DOM before/after screenshot; bounded capture', expectedText: expectedText ?? null, deviceScale: 1, input: { desktop: 'pointer', mobile: 'touch-emulated' }, state: 'default-frozen; light; reduced-motion; en-US; UTC', capturedBuildHash: objectHash(captures.map(c => c.contentHash)), repositorySource: 'not_connected', referenceIds: [] },
    judgeAttempts,
  };
  return store.saveRun(run);
}
