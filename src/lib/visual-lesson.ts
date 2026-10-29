export type VisualLessonElement = {
  id: string;
  type: 'text' | 'circle' | 'rect' | 'line' | 'arrow' | 'path' | 'label' | 'equation';
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  radius?: number;
  width?: number;
  height?: number;
  text?: string;
  points?: Array<{ x: number; y: number }>;
  fromX?: number;
  fromY?: number;
  toX?: number;
  toY?: number;
  durationMs?: number;
  delayMs?: number;
  opacity?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  fontSize?: number;
  fontWeight?: number | string;
  dash?: number[];
  semanticRole?: string;
  teachingPurpose?: 'establish' | 'introduce' | 'explain' | 'demonstrate' | 'derive' | 'compare' | 'emphasize' | 'check' | 'recap';
  assetId?: string;

  /** V3 semantic layout and teaching metadata. */
  relativeTo?: string;
  relation?: 'above' | 'below' | 'left' | 'right';
  gap?: number;
  emphasis?: number;
  anchor?: string;
  position?: {
    relativeTo?: string;
    relation?: 'above' | 'below' | 'left' | 'right';
  };
};

export type VisualLessonBeat = {
  id?: string;
  startMs: number;
  durationMs: number;
  targetId?: string;
  emphasis?: number;
  purpose?: 'establish' | 'introduce' | 'explain' | 'demonstrate' | 'derive' | 'compare' | 'emphasize' | 'check' | 'recap';
  narrationStartMs?: number;
  narrationEndMs?: number;
  narrationCue?: string;
  visualAction?: string;
  camera?: {
    x?: number;
    y?: number;
    zoom?: number;
  };
};

export type VisualLessonCamera = {
  x?: number;
  y?: number;
  zoom?: number;
  targetId?: string;
  transitionMs?: number;
};

export type VisualLessonCheckpoint = {
  question: string;
  options?: string[];
  answer?: number | string;
  explanation?: string;
};

export type VisualLessonScene = {
  id: string;
  title: string;
  durationMs: number;
  narration: string;
  caption?: string;
  elements: VisualLessonElement[];

  /** V3 director fields. All are optional for backward compatibility. */
  visualBeats?: VisualLessonBeat[];
  beats?: VisualLessonBeat[];
  camera?: VisualLessonCamera;
  transition?: {
    type?: 'cut' | 'fade' | 'crossfade' | 'zoom' | 'slide' | 'morph' | 'wipe';
    durationMs?: number;
  };
  visualMode?: 'cinematic' | 'whiteboard' | 'notebook' | 'presentation' | 'diagram';
  focusElementId?: string;
  keyTakeaway?: string;
  teachingPurpose?: 'establish' | 'introduce' | 'explain' | 'demonstrate' | 'derive' | 'compare' | 'emphasize' | 'check' | 'recap';
  assets?: Array<{ id: string; kind: string; semanticRole: string; elementId?: string }>;
  narrationSegments?: Array<{ id: string; text: string; startMs: number; endMs: number; beatId?: string }>;
  videoShot?: { id: string; purpose: string; cameraMotion: string; qualityProfile: string; continuityKey?: string };
  checkpoint?: VisualLessonCheckpoint;
};

export type VisualLesson = {
  version: 1 | 2 | 3;
  title: string;
  subject?: string;
  summary?: string;
  width: number;
  height: number;
  fps?: number;
  voice?: {
    name?: string;
    style?: string;
    language?: string;
  };
  theme?: {
    accent?: string;
    mode?: 'cinematic' | 'whiteboard' | 'presentation' | 'diagram';
  };
  scenes: VisualLessonScene[];
  creation?: {
    pipelineVersion: 1;
    qualityScore?: number;
    qualityWarnings?: string[];
  };
};

export type VisualLessonVideoClip = {
  sceneIndex: number;
  downloadUrl: string;
  filename: string;
};

export function fitVisualLessonScale(
  viewportWidth: number,
  viewportHeight: number,
  lessonWidth: number,
  lessonHeight: number,
  padding = 0
): number {
  return Math.min(
    Math.max(0, viewportWidth - padding * 2) / Math.max(1, lessonWidth),
    Math.max(0, viewportHeight - padding * 2) / Math.max(1, lessonHeight)
  );
}

export function clampVisualLessonZoom(requestedZoom: number, fitZoom: number): number {
  const safeFitZoom = Number.isFinite(fitZoom) ? Math.max(0.72, fitZoom) : 1;
  const safeRequestedZoom = Number.isFinite(requestedZoom) ? requestedZoom : safeFitZoom;
  const zoomFactor = Math.max(0.72, Math.min(2.4, safeRequestedZoom));
  return Math.min(safeFitZoom, safeFitZoom * zoomFactor);
}

export function isVisualLessonBackdrop(element: VisualLessonElement, lessonWidth: number, lessonHeight: number): boolean {
  if (element.type !== 'rect') return false;
  const width = Number.isFinite(element.width) ? Number(element.width) : 100;
  const height = Number.isFinite(element.height) ? Number(element.height) : 60;
  return element.semanticRole === 'background' ||
    (width >= lessonWidth * 0.5 && height >= lessonHeight * 0.35);
}

export function getVisualLessonElementCenter(element: VisualLessonElement): { x: number; y: number } {
  const x = Number.isFinite(element.x) ? Number(element.x) : 0;
  const y = Number.isFinite(element.y) ? Number(element.y) : 0;

  if (element.type === 'rect') {
    return {
      x: x + (Number.isFinite(element.width) ? Number(element.width) : 100) / 2,
      y: y + (Number.isFinite(element.height) ? Number(element.height) : 60) / 2,
    };
  }

  if (element.type === 'path' && element.points?.length) {
    const points = element.points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
    if (points.length) {
      const xs = points.map((point) => point.x);
      const ys = points.map((point) => point.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }
  }

  if (element.type === 'line' || element.type === 'arrow') {
    const fromX = element.type === 'arrow' && Number.isFinite(element.fromX) ? Number(element.fromX) : x;
    const fromY = element.type === 'arrow' && Number.isFinite(element.fromY) ? Number(element.fromY) : y;
    const toX = element.type === 'arrow'
      ? Number.isFinite(element.toX) ? Number(element.toX) : Number.isFinite(element.x2) ? Number(element.x2) : fromX
      : Number.isFinite(element.x2) ? Number(element.x2) : fromX;
    const toY = element.type === 'arrow'
      ? Number.isFinite(element.toY) ? Number(element.toY) : Number.isFinite(element.y2) ? Number(element.y2) : fromY
      : Number.isFinite(element.y2) ? Number(element.y2) : fromY;
    return { x: (fromX + toX) / 2, y: (fromY + toY) / 2 };
  }

  return { x, y };
}

export const VISUAL_LESSON_MAX_CHARS = 180_000;

export function normalizeVisualLessonDash(value: unknown): number[] | undefined {
  if (!Array.isArray(value) || value.length > 16) return undefined;
  const dash = Array.from(value) as unknown[];
  if (dash.some((segment) => typeof segment !== 'number' || !Number.isFinite(segment) || segment < 0)) {
    return undefined;
  }
  return dash as number[];
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const safeId = (value: unknown, fallback: string) => {
  const id = String(value ?? '').trim();
  return id || fallback;
};

/**
 * Repairs and normalizes AI storyboard output before it reaches the player.
 * Existing V1 lessons remain valid; V3 fields are additive.
 */
export function clampLesson(lesson: VisualLesson): VisualLesson {
  const width = Math.round(clamp(Number(lesson.width), 640, 1920));
  const height = Math.round(clamp(Number(lesson.height), 360, 1080));

  const scenes = (lesson.scenes || []).slice(0, 30).map((rawScene, index) => {
    const scene = rawScene || ({} as VisualLessonScene);
    const elements = (scene.elements || []).slice(0, 120).map((rawElement, elementIndex) => {
      const element = rawElement || ({} as VisualLessonElement);
      const id = safeId(element.id, `scene-${index + 1}-element-${elementIndex + 1}`);
      const x = Number.isFinite(element.x) ? Number(element.x) : undefined;
      const y = Number.isFinite(element.y) ? Number(element.y) : undefined;

      return {
        ...element,
        id,
        x,
        y,
        x2: Number.isFinite(element.x2) ? Number(element.x2) : undefined,
        y2: Number.isFinite(element.y2) ? Number(element.y2) : undefined,
        fromX: Number.isFinite(element.fromX) ? Number(element.fromX) : undefined,
        fromY: Number.isFinite(element.fromY) ? Number(element.fromY) : undefined,
        toX: Number.isFinite(element.toX) ? Number(element.toX) : undefined,
        toY: Number.isFinite(element.toY) ? Number(element.toY) : undefined,
        width: element.width == null ? undefined : clamp(Number(element.width), 1, width),
        height: element.height == null ? undefined : clamp(Number(element.height), 1, height),
        radius: element.radius == null ? undefined : clamp(Number(element.radius), 1, Math.max(width, height)),
        durationMs: element.durationMs == null ? undefined : clamp(Number(element.durationMs), 80, 120_000),
        delayMs: element.delayMs == null ? undefined : clamp(Number(element.delayMs), 0, 120_000),
        opacity: element.opacity == null ? undefined : clamp(Number(element.opacity), 0, 1),
        strokeWidth: element.strokeWidth == null ? undefined : clamp(Number(element.strokeWidth), 0.5, 24),
        dash: normalizeVisualLessonDash(element.dash),
        fontSize: element.fontSize == null ? undefined : clamp(Number(element.fontSize), 10, 120),
        emphasis: element.emphasis == null ? undefined : clamp(Number(element.emphasis), 0, 1),
        semanticRole: element.semanticRole ? String(element.semanticRole).slice(0, 120) : undefined,
        teachingPurpose: element.teachingPurpose,
        assetId: element.assetId ? String(element.assetId).slice(0, 120) : undefined,
      };
    });

    const durationMs = Math.round(clamp(Number(scene.durationMs), 1200, 120_000));
    const beats = [...(scene.visualBeats || scene.beats || [])]
      .map((beat, beatIndex) => ({
        ...beat,
        id: safeId(beat.id, `${scene.id || `scene-${index + 1}`}-beat-${beatIndex + 1}`),
        startMs: clamp(Number(beat.startMs), 0, durationMs),
        durationMs: clamp(Number(beat.durationMs), 80, Math.max(80, durationMs)),
        emphasis: beat.emphasis == null ? undefined : clamp(Number(beat.emphasis), 0, 1),
        purpose: beat.purpose,
        narrationStartMs: beat.narrationStartMs == null ? undefined : clamp(Number(beat.narrationStartMs), 0, durationMs),
        narrationEndMs: beat.narrationEndMs == null ? undefined : clamp(Number(beat.narrationEndMs), 0, durationMs),
        narrationCue: beat.narrationCue ? String(beat.narrationCue).slice(0, 240) : undefined,
        visualAction: beat.visualAction ? String(beat.visualAction).slice(0, 360) : undefined,
        camera: beat.camera
          ? {
              x: Number.isFinite(beat.camera.x) ? Number(beat.camera.x) : undefined,
              y: Number.isFinite(beat.camera.y) ? Number(beat.camera.y) : undefined,
              zoom: beat.camera.zoom == null ? undefined : clamp(Number(beat.camera.zoom), 0.8, 2.8),
            }
          : undefined,
      }))
      .sort((a, b) => a.startMs - b.startMs);

    return {
      ...scene,
      id: safeId(scene.id, `scene-${index + 1}`),
      title: String(scene.title || `Scene ${index + 1}`).slice(0, 180),
      durationMs,
      narration: String(scene.narration || '').slice(0, 6000),
      caption: scene.caption ? String(scene.caption).slice(0, 300) : undefined,
      elements,
      visualBeats: beats.length ? beats : undefined,
      beats: undefined,
      teachingPurpose: scene.teachingPurpose,
      assets: scene.assets,
      narrationSegments: scene.narrationSegments,
      videoShot: scene.videoShot,
      camera: scene.camera
        ? {
            ...scene.camera,
            zoom: scene.camera.zoom == null ? undefined : clamp(Number(scene.camera.zoom), 0.8, 2.8),
            transitionMs: scene.camera.transitionMs == null
              ? undefined
              : clamp(Number(scene.camera.transitionMs), 0, 5000),
          }
        : undefined,
      checkpoint: scene.checkpoint?.question
        ? {
            ...scene.checkpoint,
            question: String(scene.checkpoint.question).slice(0, 500),
            options: scene.checkpoint.options?.slice(0, 6).map(String),
            explanation: scene.checkpoint.explanation?.slice(0, 1200),
          }
        : undefined,
    };
  });

  return {
    ...lesson,
    version: 3,
    creation: lesson.creation
      ? { pipelineVersion: 1, qualityScore: lesson.creation.qualityScore, qualityWarnings: lesson.creation.qualityWarnings?.slice(0, 30) }
      : undefined,
    width,
    height,
    fps: Math.round(clamp(Number(lesson.fps), 24, 60)),
    scenes,
  };
}

export function validateVisualLesson(lesson: VisualLesson): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  lesson.scenes.forEach((scene, sceneIndex) => {
    if (!scene.narration.trim()) errors.push(`Scene ${sceneIndex + 1} has no narration.`);
    if (!scene.elements.length) errors.push(`Scene ${sceneIndex + 1} has no visual elements.`);

    scene.elements.forEach((element, elementIndex) => {
      if (ids.has(element.id)) errors.push(`Duplicate element id "${element.id}".`);
      ids.add(element.id);

      if (element.x != null && (element.x < -lesson.width || element.x > lesson.width * 2)) {
        errors.push(`Element "${element.id}" has an unsafe x position.`);
      }
      if (element.y != null && (element.y < -lesson.height || element.y > lesson.height * 2)) {
        errors.push(`Element "${element.id}" has an unsafe y position.`);
      }
      if (element.type === 'text' || element.type === 'label' || element.type === 'equation') {
        if (!element.text?.trim()) errors.push(`Text element "${element.id}" has no text.`);
      }
    });

    const beats = scene.visualBeats || scene.beats || [];
    if (scene.focusElementId && !scene.elements.some((element) => element.id === scene.focusElementId)) {
      errors.push(`Scene "${scene.id}" focuses missing element "${scene.focusElementId}".`);
    }
    if (scene.camera?.targetId && !scene.elements.some((element) => element.id === scene.camera?.targetId)) {
      errors.push(`Scene "${scene.id}" camera targets missing element "${scene.camera.targetId}".`);
    }
    beats.forEach((beat) => {
      if (beat.targetId && !scene.elements.some((element) => element.id === beat.targetId)) {
        errors.push(`Beat "${beat.id || 'unnamed'}" targets missing element "${beat.targetId}".`);
      }
      if (beat.narrationStartMs != null && beat.narrationEndMs != null && beat.narrationEndMs < beat.narrationStartMs) {
        errors.push(`Beat "${beat.id || 'unnamed'}" has invalid narration timing.`);
      }
      if (beat.startMs < 0 || beat.startMs > scene.durationMs) {
        errors.push(`Beat "${beat.id || 'unnamed'}" starts outside its scene.`);
      }
    });
  });

  return errors;
}

export function parseVisualLessonMarker(text: string): { text: string; lesson?: VisualLesson } {
  const match = text.match(/<<<VISUAL_LESSON>>>\s*([\s\S]*?)\s*<<<END_VISUAL_LESSON>>>/i);
  if (!match) return { text };

  try {
    const parsed = JSON.parse(match[1]);
    if (!parsed || !Array.isArray(parsed.scenes)) {
      return { text: text.replace(match[0], '').trim() };
    }

    const lesson = clampLesson(parsed as VisualLesson);
    return {
      text: text.replace(match[0], '').replace(/\n{3,}/g, '\n\n').trim(),
      lesson,
    };
  } catch {
    return { text };
  }
}

export function totalLessonDuration(lesson: VisualLesson): number {
  return lesson.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
}
