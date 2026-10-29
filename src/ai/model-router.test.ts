import test from 'node:test';
import assert from 'node:assert/strict';

import { MODEL_IDS, pickLadder } from './model-router';

test('creator and ask ladders stop at gemini-3.6-flash', () => {
  const ladders = {
    ask: pickLadder('ask', false),
    creatorAsk: pickLadder('ask', true),
    studio: pickLadder('studio', false),
    creatorStudio: pickLadder('studio', true),
  };

  assert.deepEqual(ladders.ask, [
    MODEL_IDS.flash25,
    MODEL_IDS.flashLite31,
    MODEL_IDS.flashLite35,
    MODEL_IDS.flash35,
    MODEL_IDS.flash36,
  ]);

  assert.deepEqual(ladders.creatorAsk, [
    MODEL_IDS.flash36,
    MODEL_IDS.flash35,
    MODEL_IDS.flashLite35,
    MODEL_IDS.flashLite31,
    MODEL_IDS.flash25,
  ]);

  for (const ladder of Object.values(ladders)) {
    assert.ok(!ladder.includes('googleai/gemini-3.7-flash'), '3.7 should be removed from the ladder');
    assert.ok(!ladder.includes('googleai/gemini-3.8-flash'), '3.8 should be removed from the ladder');
    assert.ok(ladder.includes(MODEL_IDS.flash36), '3.6 should remain in the ladder');
    assert.ok(ladder[ladder.length - 1] === MODEL_IDS.flash36 || ladder[ladder.length - 1] === MODEL_IDS.flash25, 'highest rung should not exceed 3.6');
  }
});
