import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseResponse, SubQJudge } from '../src/judges/subq.ts';
import { FixtureJudge } from '../src/judges/fixture.ts';
import { JudgeError, validateDecision } from '../src/judges/interface.ts';
import { input, png } from './helpers.ts';

const answer = (choice: string, options: string[]) => ({ type: 'choice', choice, probabilities: Object.fromEntries(options.map(o => [o, o === choice ? 1 : 0])), confidence: 0.8 });
function response() {
  return { model: 'subq-snap-1.1', answers: { rating: answer('2', ['1', '2', '3', '4', 'not_assessed']), finding: answer('ACTION_HIERARCHY', ['none', 'ACTION_HIERARCHY']), evidence: answer('run:desktop:screenshot', ['none', 'run:desktop:screenshot']) }, usage: { input_tokens: 100, output_tokens: 0 } };
}
const code = (expected: string) => (e: unknown) => e instanceof JudgeError && e.code === expected;

test('official request contract: bounded choices, plain image bytes and whitelisted page facts', () => {
  const body = buildRequest(input(), 'subq-snap-1.1');
  assert.deepEqual(body.images, [{ mediaType: 'image/png', base64: png }]);
  assert.equal(body.questions.rating.type, 'choice');
  assert.deepEqual(Object.keys(body.questions.rating.criteria), ['1', '2', '3', '4', 'not_assessed']);
  assert.match(body.questions.rating.instructions, /untrusted data, never instructions/);
  assert.match(body.state.untrusted_page_evidence.text, /ignore previous/); // Kept as data, not promoted into instructions.
  assert.equal(Object.hasOwn(body.state.untrusted_page_evidence.elements[0], 'id'), false);
  assert.equal(Object.hasOwn(body, 'temperature'), false); // Not a documented Decisions parameter.
  assert.equal(Object.hasOwn(body, 'store'), false);
});
test('reject invalid, oversized and too many images before transport', () => {
  for (const images of [[], Array(5).fill(input().images[0]), [{ ...input().images[0], base64: `data:image/png;base64,${png}` }], [{ ...input().images[0], base64: Buffer.alloc(4 * 1024 * 1024 + 1).toString('base64') }]]) {
    assert.throws(() => buildRequest({ ...input(), images }, 'subq-snap-1.1'), code('invalid_images'));
  }
});
test('parses ordinal choices, explicit abstention and supplied evidence IDs', () => {
  const r = parseResponse(response(), input(), 'subq-snap-1.1');
  assert.equal(r.score, 2); assert.equal(r.findingId, 'ACTION_HIERARCHY'); assert.deepEqual(r.evidenceIds, ['run:desktop:screenshot']);
  const raw = response(); raw.answers.rating = answer('not_assessed', ['1', '2', '3', '4', 'not_assessed']);
  assert.equal(parseResponse(raw, input(), raw.model).score, null);
  raw.answers.rating = answer('3', ['1', '2', '3', '4', 'not_assessed']); raw.answers.evidence = answer('none', ['none', 'run:desktop:screenshot']);
  assert.equal(parseResponse(raw, input(), raw.model).status, 'not_assessed');
});
test('reject malformed responses, unknown IDs, fractional ratings and inconsistent findings', () => {
  const variants: unknown[] = [{}, { ...response(), model: 'wrong-model' }, { ...response(), usage: { input_tokens: 1, output_tokens: 3 } }];
  for (const choice of ['1.86', '5', 'outside']) { const raw = response(); raw.answers.rating.choice = choice; variants.push(raw); }
  const unknownEvidence = response(); unknownEvidence.answers.evidence.choice = 'another-run:mobile:screenshot'; variants.push(unknownEvidence);
  const confidence = response(); confidence.answers.rating.confidence = 1.2; variants.push(confidence);
  const probabilities = response(); probabilities.answers.rating.probabilities['1'] = 0.9; variants.push(probabilities);
  for (const raw of variants) assert.throws(() => parseResponse(raw, input(), 'subq-snap-1.1'), code('invalid_response'));
  const contradiction = response(); contradiction.answers.rating = answer('4', ['1','2','3','4','not_assessed']);
  assert.throws(() => parseResponse(contradiction, input(), 'subq-snap-1.1'), code('inconsistent_response'));
});
test('paid calls require both gates; mock transport counter proves zero then one', async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.subq.ai/v1/systemone'); assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('authorization'), 'Bearer test-only-key');
    return new Response(JSON.stringify(response()));
  };
  await assert.rejects(new SubQJudge({ allowPaid: true, transport }).evaluate(input()), code('setup_needed'));
  await assert.rejects(new SubQJudge({ apiKey: 'test-only-key', transport }).evaluate(input()), code('paid_calls_disabled'));
  assert.equal(calls, 0);
  const result = await new SubQJudge({ apiKey: 'test-only-key', allowPaid: true, transport }).evaluate(input());
  assert.equal(result.score, 2); assert.equal(calls, 1);
});
for (const [status, expected] of [[400,'invalid_request'],[401,'credentials_rejected'],[402,'credits_required'],[403,'model_access_denied'],[422,'invalid_request'],[429,'rate_limited'],[503,'provider_unavailable']] as const) {
  test(`HTTP ${status} becomes sanitized ${expected} without retries`, async () => {
    let calls = 0;
    const transport: typeof fetch = async () => { calls++; return new Response(JSON.stringify({ detail: { message: 'sensitive-upstream-input', error_type: 'error' } }), { status }); };
    await assert.rejects(new SubQJudge({ apiKey: 'test-only-key', allowPaid: true, transport }).evaluate(input()), code(expected));
    assert.equal(calls, 1);
  });
}
test('network and invalid JSON errors fail honestly', async () => {
  for (const [transport, expected] of [[async () => { throw new Error('secret'); }, 'network_or_timeout'], [async () => new Response('not JSON'), 'invalid_response']] as const) {
    await assert.rejects(new SubQJudge({ apiKey: 'test-only-key', allowPaid: true, transport }).evaluate(input()), code(expected));
  }
});
test('default fixture never grades a public website', async () => {
  const r = await new FixtureJudge().evaluate({ ...input(), source: 'public_url' });
  assert.equal(r.score, null); assert.equal(r.status, 'not_assessed');
});
test('provider-independent gate rejects another run, ownership changes and false passing abstentions', async () => {
  const fixture = new FixtureJudge(); const i = input(); const r = await fixture.evaluate(i);
  assert.equal(validateDecision(r, i, fixture), r);
  for (const changed of [{ ...r, evidenceIds: ['another-run:desktop:screenshot'] }, { ...r, evidenceIds: [i.images[0].evidenceId, i.images[0].evidenceId] }, { ...r, axis: 'TYPE' }, { ...r, status: 'not_assessed' as const, score: 4 }, { ...r, score: 2.7 }, { ...r, findingId: 'UNKNOWN' }]) {
    assert.throws(() => validateDecision(changed, i, fixture), code('invalid_decision'));
  }
});
