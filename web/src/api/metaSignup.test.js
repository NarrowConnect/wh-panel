import test from 'node:test';
import assert from 'node:assert/strict';
import { createSignupCollector, parseSignupEvent } from './metaSignup.js';

const event = { origin: 'https://www.facebook.com', data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '222', phone_number_id: '444' } }) };
for (const codeFirst of [true, false]) {
  test(`signup joins both callbacks once (code first: ${codeFirst})`, () => {
    const calls = [];
    const collector = createSignupCollector((data) => calls.push(data), assert.fail);
    if (codeFirst) collector.code('authorization');
    collector.event(event);
    if (!codeFirst) collector.code('authorization');
    collector.event(event); collector.code('authorization');
    assert.deepEqual(calls, [{ code: 'authorization', waba_id: '222', phone_number_id: '444' }]);
  });
}
test('rejects foreign origins and generic FINISH messages', () => {
  assert.equal(parseSignupEvent({ ...event, origin: 'https://evilfacebook.com' }), null);
  assert.equal(parseSignupEvent({ ...event, origin: 'https://www.facebook.com.evil.test' }), null);
  assert.equal(parseSignupEvent({ ...event, data: { event: 'FINISH' } }), null);
});
test('cancelled attempt cannot submit stale assets', () => {
  const errors = [];
  const collector = createSignupCollector(assert.fail, (error) => errors.push(error));
  collector.event({ ...event, data: { type: 'WA_EMBEDDED_SIGNUP', event: 'CANCEL' } });
  collector.code('authorization'); collector.event(event);
  assert.equal(errors.length, 1);
});
test('missing phone fails without guessing the first WABA phone', () => {
  const errors = [];
  const collector = createSignupCollector(assert.fail, (error) => errors.push(error));
  collector.event({ ...event, data: { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '222' } } });
  collector.code('authorization'); assert.equal(errors.length, 1);
});
