import test from 'node:test';
import assert from 'node:assert/strict';

import { clampLesson, clampVisualLessonZoom, fitVisualLessonScale, getVisualLessonElementCenter, isVisualLessonBackdrop, normalizeVisualLessonDash, type VisualLesson, type VisualLessonElement } from './visual-lesson';

test('normalizes only valid canvas dash patterns', () => {
  assert.deepEqual(normalizeVisualLessonDash([4, 2]), [4, 2]);
  assert.deepEqual(normalizeVisualLessonDash([]), []);
  assert.equal(normalizeVisualLessonDash('dashed'), undefined);
  assert.equal(normalizeVisualLessonDash([4, -2]), undefined);
  assert.equal(normalizeVisualLessonDash([4, Number.NaN]), undefined);
  assert.equal(normalizeVisualLessonDash(Array(1)), undefined);
});

test('clamps malformed lesson dash patterns before they reach the player', () => {
  const lesson = {
    version: 1,
    title: 'Dash validation',
    width: 1280,
    height: 720,
    scenes: [{
      id: 'scene-1',
      title: 'Scene 1',
      durationMs: 5000,
      narration: 'A test scene.',
      elements: [{
        id: 'line-1',
        type: 'line',
        dash: 'dashed',
      }],
    }],
  } as unknown as VisualLesson;

  assert.equal(clampLesson(lesson).scenes[0].elements[0].dash, undefined);
});

test('fits the whole lesson in a short diagram viewport without cropping', () => {
  const scale = fitVisualLessonScale(1204, 450, 1280, 720, 28);

  assert.ok(scale > 0);
  assert.ok(1280 * scale <= 1204 - 56 + 0.01);
  assert.ok(720 * scale <= 450 - 56 + 0.01);
});

test('never lets an authored camera zoom crop the fitted diagram', () => {
  assert.equal(clampVisualLessonZoom(2.4, 0.85), 0.85);
  assert.equal(clampVisualLessonZoom(1, 1.2), 1.2);
  assert.equal(clampVisualLessonZoom(0.9, 1.2), 1.08);
});

test('does not use large equation-card panels to shrink lesson framing', () => {
  const panel: VisualLessonElement = {
    id: 'equations-panel',
    type: 'rect',
    x: 240,
    y: 140,
    width: 800,
    height: 420,
  };

  assert.equal(isVisualLessonBackdrop(panel, 1280, 720), true);
});

test('uses path geometry when focusing a visual lesson path', () => {
  const path: VisualLessonElement = {
    id: 'trajectory',
    type: 'path',
    points: [{ x: 120, y: 620 }, { x: 640, y: 180 }, { x: 1160, y: 620 }],
  };

  assert.deepEqual(getVisualLessonElementCenter(path), { x: 640, y: 400 });
});

test('uses arrow endpoints when focusing a visual lesson arrow', () => {
  const arrow: VisualLessonElement = {
    id: 'velocity',
    type: 'arrow',
    fromX: 200,
    fromY: 300,
    toX: 600,
    toY: 100,
  };

  assert.deepEqual(getVisualLessonElementCenter(arrow), { x: 400, y: 200 });
});
