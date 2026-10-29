/**
 * Shared creation contract for Visual Artifacts, Visual Lessons, Video and PDF.
 * The goal is to keep all educational outputs derived from one semantic lesson
 * representation instead of maintaining unrelated generators.
 */

import type { VisualLesson, VisualLessonScene } from '@/lib/visual-lesson';

export const MAX_VIDEO_SCENES = 16;

export type CreationAssetKind =
  | 'diagram'
  | 'equation'
  | 'graph'
  | 'chart'
  | 'photo'
  | 'veo-shot'
  | 'audio'
  | 'table'
  | 'code'
  | 'map';

export type LessonBeatPurpose =
  | 'establish'
  | 'introduce'
  | 'explain'
  | 'demonstrate'
  | 'derive'
  | 'compare'
  | 'emphasize'
  | 'check'
  | 'recap';

export type CreationAsset = {
  id: string;
  kind: CreationAssetKind;
  semanticRole: string;
  source?: 'programmatic' | 'veo' | 'user' | 'web' | 'generated';
  sceneId?: string;
  elementId?: string;
  prompt?: string;
  caption?: string;
};

export type NarrationSegment = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  sceneId: string;
  beatId?: string;
};

export type ProductionShot = {
  id: string;
  sceneId: string;
  purpose: LessonBeatPurpose;
  prompt: string;
  cameraMotion: string;
  qualityProfile: 'educational' | 'cinematic' | 'documentary' | 'diagrammatic';
  negativePrompt: string;
  durationSeconds: 5;
  continuityKey?: string;
  overlayPolicy: 'programmatic-only';
};

export type CreationQualityReport = {
  errors: string[];
  warnings: string[];
  score: number;
  checks: Record<string, boolean>;
};

export type LessonCreationProject = {
  version: 1;
  id: string;
  title: string;
  subject?: string;
  summary?: string;
  lesson: VisualLesson;
  assets: CreationAsset[];
  narration: NarrationSegment[];
  shots: ProductionShot[];
  quality: CreationQualityReport;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

function purposeForScene(scene: VisualLessonScene): LessonBeatPurpose {
  const text = `${scene.title} ${scene.narration} ${scene.keyTakeaway || ''}`.toLowerCase();
  if (scene.checkpoint) return 'check';
  if (/recap|summary|remember|takeaway|review/.test(text)) return 'recap';
  if (/example|demonstrat|experiment|observe|shows how/.test(text)) return 'demonstrate';
  if (/derive|calculate|substitut|solve|equation/.test(text)) return 'derive';
  if (/compare|versus|difference|contrast/.test(text)) return 'compare';
  if (/what is|introduc|definition|means/.test(text)) return 'introduce';
  return 'explain';
}

function sceneShotPrompt(lesson: VisualLesson, scene: VisualLessonScene): string {
  const elementSummary = scene.elements
    .filter((element) => element.type !== 'text' && element.type !== 'label' && element.type !== 'equation')
    .slice(0, 8)
    .map((element) => `${element.id}:${element.type}`)
    .join(', ');

  return [
    `Educational video shot for ${lesson.title}${lesson.subject ? ` (${lesson.subject})` : ''}.`,
    `Scene: ${scene.title}.`,
    `Teaching purpose: ${purposeForScene(scene)}.`,
    `Narration meaning: ${scene.narration}.`,
    scene.videoVisualDescription ? `Directed video shot: ${scene.videoVisualDescription}.` : '',
    scene.keyTakeaway ? `Key takeaway: ${scene.keyTakeaway}.` : '',
    scene.focusElementId ? `Primary subject: ${scene.focusElementId}.` : '',
    elementSummary ? `Underlying visual subjects: ${elementSummary}.` : '',
    'Show one dominant teaching action that directly communicates the narration.',
    'Do not invent text, equations, labels, numbers, logos, controls, subtitles, or facts.',
  ].filter(Boolean).join(' ');
}

export function buildNarrationSegments(lesson: VisualLesson): NarrationSegment[] {
  let offset = 0;
  return lesson.scenes.flatMap((scene) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean).length;
    const duration = Math.max(1, scene.durationMs);
    const segment: NarrationSegment = {
      id: `${scene.id}-narration`,
      text: scene.narration,
      startMs: offset,
      endMs: offset + duration,
      sceneId: scene.id,
    };
    // Store pacing metadata without changing the public contract.
    offset += duration;
    return words ? [segment] : [];
  });
}

export function buildProductionShots(lesson: VisualLesson): ProductionShot[] {
  return lesson.scenes.slice(0, MAX_VIDEO_SCENES).map((scene, index) => {
    const purpose = purposeForScene(scene);
    const cameraMotion = scene.camera || scene.visualBeats?.some((beat) => beat.camera)
      ? 'slow controlled push or target transition matching the storyboard; no shake'
      : 'locked-off or very slow controlled camera';

    return {
      id: `shot-${index + 1}-${scene.id}`,
      sceneId: scene.id,
      purpose,
      prompt: sceneShotPrompt(lesson, scene),
      cameraMotion,
      qualityProfile: scene.visualMode === 'cinematic'
        ? 'cinematic'
        : scene.visualMode === 'diagram'
          ? 'diagrammatic'
          : 'educational',
      negativePrompt: [
        'subtitles', 'captions', 'logos', 'watermarks', 'UI', 'random text',
        'invented equations', 'invented numbers', 'unrelated objects',
        'decorative particle effects', 'camera shake',
        ...(scene.visualMode === 'cinematic' ? ['flat line art', 'abstract vector lines', 'schematic replacing the requested subject'] : []),
      ].join(', '),
      durationSeconds: 5,
      continuityKey: scene.focusElementId || scene.id,
      overlayPolicy: 'programmatic-only',
    };
  });
}

export function validateCreationProject(project: LessonCreationProject): CreationQualityReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, boolean> = {};

  checks.lessonExists = !!project.lesson && project.lesson.scenes.length > 0;
  if (!checks.lessonExists) errors.push('The creation project contains no lesson scenes.');

  const ids = new Set<string>();
  for (const scene of project.lesson.scenes) {
    for (const element of scene.elements) {
      if (ids.has(element.id)) errors.push(`Duplicate semantic element ID: ${element.id}`);
      ids.add(element.id);
    }
    if (!scene.narration.trim()) warnings.push(`Scene ${scene.id} has no narration.`);
    if (!scene.visualBeats?.length) warnings.push(`Scene ${scene.id} has no explicit visual beats.`);
  }

  checks.semanticIds = errors.every((error) => !error.startsWith('Duplicate semantic element ID'));
  checks.narrationCoverage = project.narration.length >= project.lesson.scenes.filter((scene) => scene.narration.trim()).length;
  checks.shotCoverage = project.shots.length >= Math.min(MAX_VIDEO_SCENES, project.lesson.scenes.length);
  checks.programmaticOverlays = project.shots.every((shot) => shot.overlayPolicy === 'programmatic-only');
  checks.noEmptyScenes = project.lesson.scenes.every((scene) => scene.elements.length > 0);

  if (!checks.narrationCoverage) errors.push('Narration coverage is incomplete.');
  if (!checks.shotCoverage) errors.push('Video shot coverage is incomplete.');
  if (!checks.noEmptyScenes) errors.push('At least one scene has no visual elements.');

  const passed = Object.values(checks).filter(Boolean).length;
  const total = Math.max(1, Object.keys(checks).length);
  return {
    errors,
    warnings,
    score: clamp(Math.round((passed / total) * 100) - Math.min(20, errors.length * 5), 0, 100),
    checks,
  };
}

export function createLessonCreationProject(lesson: VisualLesson, id = `lesson-${Date.now()}`): LessonCreationProject {
  const assets: CreationAsset[] = [];
  for (const scene of lesson.scenes) {
    for (const element of scene.elements) {
      if (element.type === 'equation') assets.push({ id: `${scene.id}-${element.id}`, kind: 'equation', semanticRole: 'formula', source: 'programmatic', sceneId: scene.id, elementId: element.id });
      else if (['path', 'line', 'arrow', 'circle', 'rect'].includes(element.type)) assets.push({ id: `${scene.id}-${element.id}`, kind: 'diagram', semanticRole: 'teaching-geometry', source: 'programmatic', sceneId: scene.id, elementId: element.id });
    }
  }
  const project: LessonCreationProject = {
    version: 1,
    id,
    title: lesson.title,
    subject: lesson.subject,
    summary: lesson.summary,
    lesson,
    assets,
    narration: buildNarrationSegments(lesson),
    shots: buildProductionShots(lesson),
    quality: { errors: [], warnings: [], score: 0, checks: {} },
  };
  project.quality = validateCreationProject(project);
  return project;
}
