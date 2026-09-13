// tests/unit/engine-observer-config.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideObservers } from '../../src/content/engine/engine.js';

const ALL_ON = {
  processInlineStyles: true,
  watchClassChanges: true,
  performanceObserver: true,
  tuning: 'page-load',
  watchNewElements: true,
  processShadowStyles: true,
};

const OBS = (elementMO, styleMO, classMO, poShort, poLong, continueWatch, shadow) =>
  ({ elementMO, styleMO, classMO, poShort, poLong, continueWatch, shadow });

test('decideObservers truth table', async (t) => {
  const cases = [
    {
      name: 'empty engine → elementMO only',
      engine: {},
      want: OBS(true, false, false, false, false, false, false),
    },
    {
      name: 'all flags on + tuning page-load → everything on',
      engine: { ...ALL_ON },
      want: OBS(true, true, true, true, true, true, true),
    },
    {
      name: 'all flags on + tuning performance → PO paths off',
      engine: { ...ALL_ON, tuning: 'performance' },
      want: OBS(true, true, true, false, false, true, true),
    },
    {
      name: 'processInlineStyles only',
      engine: { processInlineStyles: true },
      want: OBS(true, true, false, false, false, false, false),
    },
    {
      name: 'watchClassChanges only',
      engine: { watchClassChanges: true },
      want: OBS(true, false, true, false, false, false, false),
    },
    {
      name: 'watchNewElements only',
      engine: { watchNewElements: true },
      want: OBS(true, false, false, false, false, true, false),
    },
    {
      name: 'processShadowStyles only',
      engine: { processShadowStyles: true },
      want: OBS(true, false, false, false, false, false, true),
    },
    {
      name: 'performanceObserver + page-load → PO paths on',
      engine: { performanceObserver: true, tuning: 'page-load' },
      want: OBS(true, false, false, true, true, false, false),
    },
    {
      name: 'performanceObserver + performance → PO paths off',
      engine: { performanceObserver: true, tuning: 'performance' },
      want: OBS(true, false, false, false, false, false, false),
    },
    {
      name: 'performanceObserver + other tuning value → PO paths off',
      engine: { performanceObserver: true, tuning: 'balanced' },
      want: OBS(true, false, false, false, false, false, false),
    },
    {
      name: 'truthy-but-not-true values are rejected (strict ===)',
      engine: {
        processInlineStyles: 1,
        watchClassChanges: 'yes',
        performanceObserver: 1,
        tuning: 'page-load',
        watchNewElements: 1,
        processShadowStyles: 1,
      },
      want: OBS(true, false, false, false, false, false, false),
    },
  ];
  for (const c of cases) {
    await t.test(c.name, () => {
      assert.deepEqual(decideObservers(c.engine), c.want);
    });
  }
});
