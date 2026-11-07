// Edge cases found by breaking the harness on purpose (evals/TEST-LOG.md, 2026-11-08).
// Each test re-creates a hole that was observed with the live judge and asserts it stays closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, normalizeBrief, maskVolatile } from '../src/judges/subq.ts';
import { layoutFingerprint, navigationFailure } from '../src/capture/capture.ts';
import { input } from './helpers.ts';

test('brief typing style does not change the judge request (was a 12-point swing)', () => {
  const asTyped = (feeling: string, task: string) => {
    const i = input();
    return JSON.stringify(buildRequest({ ...i, profile: { ...i.profile, feeling, task } }, 'subq-snap-1.1'));
  };
  const reference = asTyped('Welcoming and practical', 'Help visitors find the next useful action');
  for (const [feeling, task] of [
    ['welcoming and practical', 'Help visitors find the next useful action.'],
    ['  Welcoming   and practical ', 'Help visitors find the next useful action!'],
    ['Welcoming and practical.', 'help visitors find the next useful action'],
  ]) assert.equal(asTyped(feeling, task), reference, `${feeling} / ${task}`);
});

test('brief normalization keeps meaning and brand casing inside the text', () => {
  assert.equal(normalizeBrief('  indie founders using iPhone apps. '), 'Indie founders using iPhone apps');
  assert.equal(normalizeBrief('Dense dashboards, Editorial'), 'Dense dashboards, Editorial');
  assert.equal(normalizeBrief(''), '');
  assert.equal(normalizeBrief(undefined), '');
});

test('clock readings are masked before judging, other numbers are kept', () => {
  assert.equal(maskVolatile('Local time 14:05:09 PM in Oslo'), 'Local time [time] in Oslo');
  assert.equal(maskVolatile('Opens 10:00 am, $45 per class, 3 seats left'), 'Opens [time], $45 per class, 3 seats left');
  const at = (text: string) => { const i = input(); return JSON.stringify(buildRequest({ ...i, capture: { ...i.capture, facts: { ...i.capture.facts, text } } }, 'subq-snap-1.1')); };
  assert.equal(at('Now 12:41:07'), at('Now 12:41:09'));
});

test('a page with a live clock keeps its layout fingerprint; a real layout change does not', () => {
  const page = (clock: string, ctaWidth = 180) => ({ title: `Time ${clock}`, elements: [
    { tag: 'h1', text: clock, fontSize: 64, color: 'rgb(0, 0, 0)', background: 'rgba(0, 0, 0, 0)', width: 300, height: 80, x: 40, y: 120 },
    { tag: 'a', text: 'Book a class', fontSize: 18, color: 'rgb(255, 255, 255)', background: 'rgb(154, 59, 30)', width: ctaWidth, height: 52, x: 40, y: 240 },
  ] });
  assert.equal(layoutFingerprint(page('12:41:07')), layoutFingerprint(page('12:41:59')));
  assert.notEqual(layoutFingerprint(page('12:41:07')), layoutFingerprint(page('12:41:07', 320)));
});

test('failure messages say what went wrong and keep the known prefix', () => {
  const cases: [number | null, string | null, RegExp][] = [
    [404, null, /HTTP 404 \(page not found\)/],
    [403, null, /refused access \(HTTP 403\).*bot protection/],
    [429, null, /HTTP 429/],
    [503, null, /server error \(HTTP 503\)/],
    [null, null, /did not respond/],
    [null, 'Private, local, reserved and metadata destinations are blocked.', /private or internal address/],
    [null, 'Capture budget exceeded.', /request was blocked \(Capture budget exceeded\)/],
  ];
  for (const [status, blocked, pattern] of cases) {
    const message = navigationFailure(status, blocked);
    assert.match(message, pattern);
    assert.ok(message.startsWith('Navigation did not'), 'known prefix keeps the message visible to users');
  }
});
