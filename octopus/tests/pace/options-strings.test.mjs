// tests/pace/options-strings.test.mjs — 倍速翼文案单源在场(键清单钉子)
import test from 'node:test';
import assert from 'node:assert/strict';
import { PACE_STRINGS } from '../../src/tools/pace/shared/strings.js';

const NEED = ['optionsHeading', 'optionsIntro', 'optionsReset', 'dialTitle', 'dialLabel',
  'holdTitle', 'holdLabel', 'holdOnLine', 'skipTitle', 'skipSwitchLabel', 'skipIntroLabel',
  'skipOutroLabel', 'skipUnit', 'skipStepNote', 'advanceTitle', 'advanceLabel', 'advanceHint',
  'shortcutHint', 'presetsLabel'];

test('PACE_STRINGS 覆盖倍速翼全部用词', () => {
  for (const k of NEED) assert.ok(PACE_STRINGS[k], `缺键: ${k}`);
  assert.ok(PACE_STRINGS.holdOnLine.includes('{pace}'));
});
