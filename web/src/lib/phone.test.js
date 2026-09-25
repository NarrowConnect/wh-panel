import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './phone.js';

test('adds the Brazil code to DDD + number', () => {
  assert.equal(normalizePhone('(11) 97777-6666'), '+5511977776666');
  assert.equal(normalizePhone('11 3333-4444'), '+551133334444');
});

test('keeps numbers that already carry a country code', () => {
  assert.equal(normalizePhone('+55 11 99999-8888'), '+5511999998888');
  assert.equal(normalizePhone('5511999998888'), '+5511999998888');
  assert.equal(normalizePhone('+1 415 555 0100'), '+14155550100');
});

test('rejects numbers that are too short or too long', () => {
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('1234567890123456'), null);
});
