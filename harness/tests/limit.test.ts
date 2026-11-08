import test from 'node:test';
import assert from 'node:assert/strict';
import { mapLimited, judgeConcurrency } from '../src/util/limit.ts';

test('judge calls run concurrently up to the limit and keep input order', async () => {
  let inFlight = 0, peak = 0;
  const delays = [30, 5, 20, 1, 15, 8, 2, 25];
  const out = await mapLimited(delays, 3, async (ms, i) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, ms));
    inFlight--; return i;
  });
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(peak, 3);
});

test('tasks that finish out of order still return in input order', async () => {
  const out = await mapLimited([1, 2, 3], 2, async n => { await new Promise(r => setTimeout(r, 4 - n)); return n * 10; });
  assert.deepEqual(out, [10, 20, 30]);
});

test('concurrency setting is bounded', () => {
  const was = process.env.BETTER_JUDGE_CONCURRENCY;
  for (const [value, expected] of [['4', 4], ['0', 6], ['99', 6], ['abc', 6], [undefined, 6]] as const) {
    if (value === undefined) delete process.env.BETTER_JUDGE_CONCURRENCY; else process.env.BETTER_JUDGE_CONCURRENCY = value;
    assert.equal(judgeConcurrency(), expected);
  }
  if (was === undefined) delete process.env.BETTER_JUDGE_CONCURRENCY; else process.env.BETTER_JUDGE_CONCURRENCY = was;
});
