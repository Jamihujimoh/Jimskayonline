import test from 'node:test';
import assert from 'node:assert/strict';

import { clampLesson, clampVisualLessonZoom, fitVisualLessonScale, getVisualLessonElementCenter, isVisualLessonBackdrop, normalizeVisualLessonDash, type VisualLesson, type VisualLessonElement } from './visual-lesson';
import { buildProductionShots, MAX_VIDEO_SCENES } from './creation-pipeline';

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

test('plans detailed directed footage across more than eight video scenes', () => {
  const lesson = {
    version: 3,
    title: 'How a vehicle moves',
    subject: 'Physics',
    width: 1280,
    height: 720,
    scenes: Array.from({ length: 12 }, (_, index) => ({
      id: `scene-${index + 1}`,
      title: `Motion phase ${index + 1}`,
      durationMs: 12000,
      narration: `Explain motion phase ${index + 1} with a concrete cause and effect.`,
      videoVisualDescription: `A recognizable vehicle rolls forward on a real road while its wheels turn.`,
      visualMode: 'cinematic',
      focusElementId: 'vehicle',
      elements: [{ id: 'vehicle', type: 'rect' }],
    })),
  } as unknown as VisualLesson;

  const shots = buildProductionShots(clampLesson(lesson));

  assert.equal(MAX_VIDEO_SCENES, 16);
  assert.equal(shots.length, 12);
  assert.match(shots[0].prompt, /recognizable vehicle rolls forward/);
  assert.match(shots[0].negativePrompt, /flat line art/);
});

test('caps generated video coverage at the configured maximum', () => {
  const lesson = {
    version: 3,
    title: 'Long lesson',
    width: 1280,
    height: 720,
    scenes: Array.from({ length: MAX_VIDEO_SCENES + 4 }, (_, index) => ({
      id: `scene-${index + 1}`,
      title: `Scene ${index + 1}`,
      durationMs: 12000,
      narration: 'A complete teaching explanation.',
      elements: [{ id: `element-${index + 1}`, type: 'circle' }],
    })),
  } as unknown as VisualLesson;

  assert.equal(buildProductionShots(clampLesson(lesson)).length, MAX_VIDEO_SCENES);
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
