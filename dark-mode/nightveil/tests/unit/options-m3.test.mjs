// tests/unit/options-m3.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTION_ORDER, sectionKeyOf, FLASHGUARD_MODES, parseHostList, clampNumber, SEAT_CARDS } from '../../src/shared/optionsM3.js';

test('SECTION_ORDER mirrors the seven details ids in options.html order', () => {
  assert.deepEqual(SECTION_ORDER, ['sec-themes', 'sec-options', 'sec-usercss', 'sec-engine', 'sec-exclusion', 'sec-inclusion', 'sec-schedule']);
  assert.equal(sectionKeyOf('sec-usercss'), 'usercss');
});

test('FLASHGUARD_MODES values match settings.flashGuard.mode domain', () => {
  assert.deepEqual(FLASHGUARD_MODES.map((m) => m.value), ['simple-dark', 'hide', 'brightness']);
});

test('parseHostList: newline split, trim, drop empties, dedup (nightveil list convention)', () => {
  assert.deepEqual(parseHostList('google.com\n  yahoo.com \ngoogle.com\n\n'), ['google.com', 'yahoo.com']);
});

test('clampNumber: empty → fallback, out-of-range clamps', () => {
  assert.equal(clampNumber('', 10, 22, 13), 13);
  assert.equal(clampNumber('99', 10, 22, 13), 22);
  assert.equal(clampNumber('5', 10, 22, 13), 10);
  assert.equal(clampNumber('15', 10, 22, 13), 15);
});

test('SEAT_CARDS maps the three theme seats onto themeId values', () => {
  assert.deepEqual(SEAT_CARDS.map((c) => c.themeId), ['adaptive', 'classic', 'custom']);
});
