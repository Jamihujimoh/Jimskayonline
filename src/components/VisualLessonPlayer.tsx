'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw, Volume2, VolumeX, Loader2 } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'katex/contrib/mhchem';
import { Button } from '@/components/ui/button';
import { generateNarration } from '@/ai/flows/generate-narration-flow';
import { buildNarrationTimeline, scaleRange } from '@/lib/narration-sync';
import { clampVisualLessonZoom, fitVisualLessonScale, getVisualLessonElementCenter, isVisualLessonBackdrop, normalizeVisualLessonDash, type VisualLesson, type VisualLessonElement, type VisualLessonVideoClip } from '@/lib/visual-lesson';

function ease(t: number) { return t * t * (3 - 2 * t); }
function num(v: number | undefined, fallback = 0) { return Number.isFinite(v) ? Number(v) : fallback; }

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const size = Math.max(8, width * 2.5);
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill();
}


/* -------------------------------------------------------------------------- */
/* Professional Visual Lesson Runtime                                         */
/* -------------------------------------------------------------------------- */

type RuntimePoint = { x: number; y: number };
type RuntimeBeat = {
  id?: string;
  startMs?: number;
  durationMs?: number;
  targetId?: string;
  emphasis?: number;
  purpose?: string;
  narrationStartMs?: number;
  narrationEndMs?: number;
  narrationCue?: string;
  visualAction?: string;
  camera?: { x?: number; y?: number; zoom?: number };
};

type RuntimeScene = VisualLesson['scenes'][number] & {
  visualBeats?: RuntimeBeat[];
  beats?: RuntimeBeat[];
  camera?: { x?: number; y?: number; zoom?: number; targetId?: string; transitionMs?: number };
  transition?: { type?: string; durationMs?: number };
  visualMode?: 'cinematic' | 'whiteboard' | 'notebook' | 'presentation' | 'diagram';
  focusElementId?: string;
  keyTakeaway?: string;
  checkpoint?: {
    question?: string;
    options?: string[];
    answer?: number | string;
    explanation?: string;
  };
};

const RENDER_VERSION = '4.0.0-audio-master';

function createMp4Recorder(stream: MediaStream) {
  const mimeType = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
  ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) throw new Error('MP4 recording is not supported by this browser.');
  return new MediaRecorder(stream, { mimeType });
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smoothstep(t: number) { const x = clamp01(t); return x * x * (3 - 2 * x); }
function easeOutCubic(t: number) { const x = 1 - clamp01(t); return 1 - x * x * x; }

function sceneRuntime(scene: VisualLesson['scenes'][number]) {
  return scene as RuntimeScene;
}

function getBeats(scene: VisualLesson['scenes'][number], runtimeDurationMs?: number): RuntimeBeat[] {
  const s = sceneRuntime(scene);
  const authoredDuration = Math.max(1, num(scene.durationMs, 1));
  const runtimeDuration = Math.max(1, num(runtimeDurationMs, authoredDuration));
  const narrationTimeline = buildNarrationTimeline(scene.narration, runtimeDuration);
  return [...(s.visualBeats || s.beats || [])]
    .map((beat) => {
      const cue = String(beat.narrationCue || '').trim().toLowerCase();
      const cueUnit = cue
        ? narrationTimeline.find((unit) => unit.text.toLowerCase().includes(cue) || cue.split(/\s+/).filter(Boolean).every((word) => unit.text.toLowerCase().includes(word)))
        : undefined;
      if (cueUnit) {
        return { ...beat, startMs: cueUnit.startMs, durationMs: Math.max(80, cueUnit.endMs - cueUnit.startMs) };
      }
      const range = scaleRange(
        num(beat.narrationStartMs ?? beat.startMs),
        num(beat.narrationEndMs ?? (num(beat.startMs) + Math.max(1, num(beat.durationMs, 700)))),
        authoredDuration,
        runtimeDuration,
      );
      return { ...beat, startMs: range.startMs, durationMs: Math.max(80, range.endMs - range.startMs) };
    })
    .sort((a, b) => num(a.startMs) - num(b.startMs));
}

function beatFor(scene: VisualLesson['scenes'][number], timeMs: number, elementId?: string, runtimeDurationMs?: number) {
  const beats = getBeats(scene, runtimeDurationMs);
  return beats.find((b) =>
    (!elementId || b.targetId === elementId) &&
    timeMs >= num(b.startMs) &&
    timeMs <= num(b.startMs) + Math.max(1, num(b.durationMs, 700))
  );
}

function visualProgress(
  sceneTime: number,
  startMs: number,
  durationMs: number,
  reducedMotion = false
) {
  if (reducedMotion) return sceneTime >= startMs ? 1 : 0;
  return easeOutCubic((sceneTime - startMs) / Math.max(1, durationMs));
}

function elementId(el: VisualLessonElement, index: number) {
  return String((el as any).id || (el as any).key || `${el.type}-${index}`);
}

function elementCenter(el: VisualLessonElement): RuntimePoint {
  return getVisualLessonElementCenter(el);
}

/**
 * Resolves simple semantic positioning without requiring the AI to know exact
 * canvas coordinates. Existing x/y always win, so this stays backward compatible.
 */
function resolveElementPosition(
  el: VisualLessonElement,
  index: number,
  elements: VisualLessonElement[]
): RuntimePoint {
  const e = el as any;
  if (Number.isFinite(e.x) && Number.isFinite(e.y)) return { x: e.x, y: e.y };

  const relativeTo = e.relativeTo || e.anchor || e.position?.relativeTo;
  const anchor = relativeTo
    ? elements.find((candidate, candidateIndex) => elementId(candidate, candidateIndex) === relativeTo)
    : undefined;

  if (anchor) {
    const a = elementCenter(anchor);
    const anchorBounds = anchor.type === 'text' || anchor.type === 'label' || anchor.type === 'equation'
      ? {
          left: a.x,
          right: a.x + Math.max(80, String((anchor as any).text || '').length * Math.max(12, num((anchor as any).fontSize, 24)) * .55),
          top: a.y - Math.max(30, num((anchor as any).fontSize, 24) * 1.4) / 2,
          bottom: a.y + Math.max(30, num((anchor as any).fontSize, 24) * 1.4) / 2,
        }
      : elementBounds(anchor, elements.indexOf(anchor), elements);
    const gap = num(e.gap, 36);
    const width = Math.max(180, num(e.width, 520));
    const height = Math.max(30, num(e.height, num(e.fontSize, 28) * 1.35));
    const relation = e.position?.relation || e.relation || 'below';
    if (relation === 'right') return { x: anchorBounds.right + gap, y: (anchorBounds.top + anchorBounds.bottom) / 2 };
    if (relation === 'left') return { x: anchorBounds.left - gap - width, y: (anchorBounds.top + anchorBounds.bottom) / 2 };
    if (relation === 'above') return { x: (anchorBounds.left + anchorBounds.right - width) / 2, y: anchorBounds.top - gap - height / 2 };
    return { x: (anchorBounds.left + anchorBounds.right - width) / 2, y: anchorBounds.bottom + gap + height / 2 };
  }

  // Safe fallback layout: keep unpositioned objects in a clean staggered area.
  const col = index % 2;
  const row = Math.floor(index / 2);
  return { x: 90 + col * 420, y: 90 + row * 120 };
}

function elementBounds(el: VisualLessonElement, index: number, elements: VisualLessonElement[] = []): { left: number; top: number; right: number; bottom: number } {
  const e = el as any;
  const p = resolveElementPosition(el, index, elements);
  const x = Number.isFinite(e.x) ? num(e.x) : p.x;
  const y = Number.isFinite(e.y) ? num(e.y) : p.y;
  if (e.type === 'circle') {
    const r = num(e.radius, 20);
    return { left: x - r, top: y - r, right: x + r, bottom: y + r };
  }
  if (e.type === 'rect') return { left: x, top: y, right: x + num(e.width, 100), bottom: y + num(e.height, 60) };
  if (e.type === 'line' || e.type === 'arrow') {
    const x2 = num(e.type === 'arrow' ? e.toX : e.x2, x);
    const y2 = num(e.type === 'arrow' ? e.toY : e.y2, y);
    return { left: Math.min(x, x2), top: Math.min(y, y2), right: Math.max(x, x2), bottom: Math.max(y, y2) };
  }
  if (e.type === 'path' && Array.isArray(e.points) && e.points.length) {
    const xs = e.points.map((q: any) => num(q.x));
    const ys = e.points.map((q: any) => num(q.y));
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
  }
  const fontSize = Math.max(14, num(e.fontSize, 28));
  const naturalWidth = String(e.text || '').length * fontSize * .55;
  const w = Math.max(80, Math.min(num(e.width, 520), naturalWidth || 80));
  const h = Math.max(30, num(e.height, num(e.fontSize, 24) * 1.4));
  return { left: x, top: y - h / 2, right: x + w, bottom: y + h / 2 };
}

function autoFrame(elements: VisualLessonElement[], lessonWidth: number, lessonHeight: number, frameAspect = lessonWidth / lessonHeight, focusId?: string) {
  if (!elements.length) return { x: lessonWidth / 2, y: lessonHeight / 2, zoom: 1 };
  let contentElements = elements.filter((element, index) => {
    if (element.type !== 'rect' || elements.length === 1) return true;
    return !isVisualLessonBackdrop(element, lessonWidth, lessonHeight);
  });
  const focusedElement = focusId ? elements.find((element, index) => elementId(element, index) === focusId) : undefined;
  const panelCount = contentElements.filter((element) =>
    element.type === 'rect' && !isVisualLessonBackdrop(element, lessonWidth, lessonHeight)
  ).length;
  if (focusedElement && panelCount < 2) {
    const focusedBounds = elementBounds(focusedElement, elements.indexOf(focusedElement), elements);
    const focusX = (focusedBounds.left + focusedBounds.right) / 2;
    const focusY = (focusedBounds.top + focusedBounds.bottom) / 2;
    const nearbyElements = contentElements.filter((element) => {
      if (element === focusedElement) return true;
      if (element.type === 'line' || element.type === 'arrow') {
        const bounds = elementBounds(element, elements.indexOf(element), elements);
        if (bounds.right - bounds.left > lessonWidth * 0.65 || bounds.bottom - bounds.top > lessonHeight * 0.65) return false;
      }
      const bounds = elementBounds(element, elements.indexOf(element), elements);
      const centerX = (bounds.left + bounds.right) / 2;
      const centerY = (bounds.top + bounds.bottom) / 2;
      return Math.abs(centerX - focusX) <= lessonWidth * 0.35 && Math.abs(centerY - focusY) <= lessonHeight * 0.4;
    });
    if (nearbyElements.length) contentElements = nearbyElements;
  }
  const framedElements = contentElements.length ? contentElements : elements;
  const bounds = framedElements.map((el) => elementBounds(el, elements.indexOf(el), elements));
  const left = Math.min(...bounds.map((b) => b.left));
  const top = Math.min(...bounds.map((b) => b.top));
  const right = Math.max(...bounds.map((b) => b.right));
  const bottom = Math.max(...bounds.map((b) => b.bottom));
  const contentWidth = Math.max(240, right - left);
  const contentHeight = Math.max(180, bottom - top);
  const visibleWidth = Math.min(lessonWidth, lessonHeight * frameAspect);
  const visibleHeight = Math.min(lessonHeight, lessonWidth / frameAspect);
  const zoom = Math.max(.85, Math.min(8, Math.min((visibleWidth * .96) / contentWidth, (visibleHeight * .96) / contentHeight)));
  return { x: (left + right) / 2, y: (top + bottom) / 2, zoom };
}
function focusPoint(scene: VisualLesson['scenes'][number], elements: VisualLessonElement[], auto: RuntimePoint & { zoom: number }, lessonWidth: number, lessonHeight: number) {
  const s = sceneRuntime(scene);
  const id = s.focusElementId || s.camera?.targetId;
  if (id) {
    const found = elements.find((el, i) => elementId(el, i) === id);
    if (found && !isVisualLessonBackdrop(found, lessonWidth, lessonHeight)) return elementCenter(found);
  }
  if (id) return { x: auto.x, y: auto.y };
  return { x: num(s.camera?.x, 0), y: num(s.camera?.y, 0) };
}
function cameraAt(
  scene: VisualLesson['scenes'][number],
  sceneTime: number,
  elements: VisualLessonElement[],
  lessonWidth: number,
  lessonHeight: number,
  reducedMotion = false,
  runtimeDurationMs = scene.durationMs,
  frameAspect = lessonWidth / lessonHeight
) {
  const s = sceneRuntime(scene);
  const auto = autoFrame(elements, lessonWidth, lessonHeight, frameAspect, s.focusElementId || s.camera?.targetId);
  const baseTarget = focusPoint(scene, elements, auto, lessonWidth, lessonHeight);
  const hasExplicitCamera = !!s.camera && (s.camera.x != null || s.camera.y != null || s.camera.zoom != null || s.camera.targetId);
  const explicitZoom = num(s.camera?.zoom, auto.zoom);
  const targetX = num(s.camera?.x, hasExplicitCamera ? baseTarget.x : auto.x);
  const targetY = num(s.camera?.y, hasExplicitCamera ? baseTarget.y : auto.y);

  let x = targetX;
  let y = targetY;
  let zoom = clampVisualLessonZoom(explicitZoom, auto.zoom);

  for (const beat of getBeats(scene, runtimeDurationMs)) {
    const start = num(beat.startMs);
    const duration = Math.max(1, num(beat.durationMs, 700));
    const p = smoothstep((sceneTime - start) / duration);
    if (p <= 0) continue;
    if (beat.camera) {
      x = lerp(x, num(beat.camera.x, x), p);
      y = lerp(y, num(beat.camera.y, y), p);
      zoom = lerp(zoom, clampVisualLessonZoom(num(beat.camera.zoom, zoom), auto.zoom), p);
    }
  }

  if (zoom >= auto.zoom * .999) {
    x = auto.x;
    y = auto.y;
  }

  if (!Number.isFinite(x)) x = lessonWidth / 2;
  if (!Number.isFinite(y)) y = lessonHeight / 2;
  return {
    x, y, zoom,
    reducedMotion,
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, spacing = 44) {
  ctx.save();
  ctx.strokeStyle = 'rgba(148,163,184,.055)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += spacing) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
  }
  for (let y = 0; y <= height; y += spacing) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawFocusRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  intensity = 1
) {
  if (intensity <= 0) return;
  ctx.save();
  ctx.globalAlpha = .16 * intensity;
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(x, y, radius + 12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = .8 * intensity;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEquation(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  width: number
) {
  const lines = text.trim().split(/\n+/).map((line) =>
    line.trim().replace(/^\${1,2}/, '').replace(/\${1,2}$/, '').trim()
  ).filter(Boolean);
  const tex = lines.length > 1
    ? `\\begin{aligned}${lines.join('\\\\')}\\end{aligned}`
    : lines[0] || '';
  const key = `${tex}|${size}|${color}|${width}`;
  const cached = mathImageCache.get(key);
  if (cached?.image) {
    const scale = Math.min(1, width / cached.image.width);
    const imageWidth = cached.image.width * scale;
    const imageHeight = cached.image.height * scale;
    ctx.drawImage(cached.image, x, y - imageHeight / 2, imageWidth, imageHeight);
    return;
  }
  if (cached?.fallback) {
    drawEquationFallback(ctx, cached.fallback, x, y, size, color, width);
    return;
  }
  if (!cached) {
    mathImageCache.set(key, { pending: true });
    void renderMathImage(tex, size, color).then((image) => {
      mathImageCache.set(key, { image });
      window.dispatchEvent(new Event('visual-lesson-math-ready'));
    }).catch(() => {
      mathImageCache.set(key, { fallback: equationFallbackText(tex) });
      window.dispatchEvent(new Event('visual-lesson-math-ready'));
    });
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${Math.max(18, size)}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('Typesetting…', x, y);
  ctx.restore();
}

function equationFallbackText(tex: string) {
  const symbols: Record<string, string> = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', theta: 'θ', lambda: 'λ', mu: 'μ',
    pi: 'π', sigma: 'σ', omega: 'ω', Delta: 'Δ', Theta: 'Θ', Sigma: 'Σ', Omega: 'Ω',
  };
  return tex
    .replace(/\\begin\{(?:aligned|array)\}(?:\{[^{}]*\})?|\\end\{(?:aligned|array)\}/g, '')
    .replace(/\\\\/g, ' = ')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, '$1')
    .replace(/\\(?:cdot|times|pm|approx|leq|geq|neq|infty)\b/g, (command) => ({
      '\\cdot': '·', '\\times': '×', '\\pm': '±', '\\approx': '≈',
      '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\infty': '∞',
    }[command] || command))
    .replace(/\\([A-Za-z]+)\b/g, (command, name: string) => symbols[name] || '')
    .replace(/[{}$]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function drawEquationFallback(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  width: number
) {
  const fontSize = Math.max(18, size);
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > width) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  const lineHeight = fontSize * 1.35;
  lines.forEach((value, index) => {
    ctx.fillText(value, x, y + (index - (lines.length - 1) / 2) * lineHeight, width);
  });
  ctx.restore();
}

const mathImageCache = new Map<string, { image?: HTMLImageElement; fallback?: string; pending?: boolean }>();
const mathStyleCache = new Map<string, string>();

function mathStyles() {
  const cached = mathStyleCache.get('katex');
  if (cached) return cached;

  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    const stylesheetUrl = sheet.href;
    if (!stylesheetUrl) continue;
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        const css = rule.cssText;
        if (css.startsWith('@import')) continue;
        if (!css.includes('katex') && !css.includes('KaTeX_')) continue;
        rules.push(css.replace(/url\((['"]?)([^)'"]+)\1\)/g, (_match, quote: string, path: string) => {
          try {
            return `url("${new URL(path, stylesheetUrl).href}")`;
          } catch {
            return `url(${quote}${path}${quote})`;
          }
        }));
      }
    } catch {
      continue;
    }
  }

  const css = rules.join('\n');
  mathStyleCache.set('katex', css);
  return css;
}

function renderMathImage(tex: string, fontSize: number, color: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    try {
      const container = document.createElement('div');
      container.style.cssText = `position:fixed;left:-10000px;top:0;display:inline-block;visibility:hidden;font-size:${fontSize}px;color:${color};`;
      container.innerHTML = katex.renderToString(tex, {
        displayMode: true,
        output: 'html',
        throwOnError: false,
      });
      document.body.appendChild(container);
      const bounds = container.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(bounds.width + 8));
      const height = Math.max(1, Math.ceil(bounds.height + 8));
      const styles = mathStyles().replace(/<\/style/gi, '<\\/style');
      const markup = `<div xmlns="http://www.w3.org/1999/xhtml" style="display:inline-block;padding:4px;color:${color};font-size:${fontSize}px;line-height:1.2">${container.innerHTML}</div>`;
      container.remove();

      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml"><style><![CDATA[${styles}]]></style>${markup}</div></foreignObject></svg>`;
      const image = new Image();
      const objectUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('KaTeX could not render this equation in the lesson canvas.'));
      };
      image.src = objectUrl;
    } catch (cause) {
      reject(cause);
    }
  });
}

function equationText(text: string) {
  const value = text.trim();
  return /^\${1,2}[\s\S]+\${1,2}$/.test(value) || /\\(?:frac|sqrt|sum|int|sin|cos|tan|theta|alpha|beta|pi|left|right|begin)\b/.test(value);
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  el: VisualLessonElement,
  sceneTime: number,
  defaultDelay: number,
  defaultDuration: number,
  elements: VisualLessonElement[],
  index: number,
  scene: VisualLesson['scenes'][number],
  sceneDuration: number,
  lessonWidth: number,
  reducedMotion = false,
  layoutPosition?: RuntimePoint,
  annotationPosition?: RuntimePoint
) {
  const e = el as any;
  const delay = e.delayMs == null ? defaultDelay : num(e.delayMs);
  const duration = Math.max(120, e.durationMs == null ? defaultDuration : num(e.durationMs, defaultDuration));
  const raw = visualProgress(sceneTime, delay, duration, reducedMotion);
  if (!reducedMotion && sceneTime < delay) return;

  const position = layoutPosition || resolveElementPosition(el, index, elements);
  const x = layoutPosition ? position.x : Number.isFinite(e.x) ? num(e.x) : position.x;
  const y = layoutPosition ? position.y : Number.isFinite(e.y) ? num(e.y) : position.y;
  const targetX = e.toX != null ? num(e.toX) : x;
  const targetY = e.toY != null ? num(e.toY) : y;
  const move = smoothstep(raw);
  const currentX = lerp(x, targetX, move);
  const currentY = lerp(y, targetY, move);

  const beat = beatFor(scene, sceneTime, elementId(el, index), sceneDuration);
  const emphasis = clamp01(num(beat?.emphasis, num(e.emphasis, 0)));
  const focusedElementId = sceneRuntime(scene).focusElementId || sceneRuntime(scene).camera?.targetId;
  const isFocusedElement = focusedElementId === elementId(el, index);
  const alpha = num(e.opacity, 1) * (reducedMotion ? 1 : smoothstep(Math.min(1, raw * 3)));
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineWidth = num(e.strokeWidth, 3);
  ctx.strokeStyle = e.stroke || '#8ab4ff';
  ctx.fillStyle = e.fill || '#ffffff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.setLineDash(normalizeVisualLessonDash(e.dash) ?? []);

  const glow = emphasis > .05;
  if (glow) {
    ctx.shadowColor = e.stroke || '#67e8f9';
    ctx.shadowBlur = 18 * emphasis;
  }

  if (e.type === 'circle') {
    const radius = Math.max(num(e.radius, 20), isFocusedElement ? lessonWidth * .05 : 0);
    ctx.beginPath(); ctx.arc(currentX, currentY, radius, 0, Math.PI * 2);
    if (e.fill) ctx.fill();
    if (e.stroke) ctx.stroke();
    if (emphasis) drawFocusRing(ctx, currentX, currentY, radius, emphasis);

  } else if (e.type === 'rect') {
    const w = num(e.width, 100), h = num(e.height, 60);
    ctx.beginPath(); ctx.roundRect(currentX, currentY, w, h, Math.min(18, Math.min(w, h) * .12));
    if (e.fill) ctx.fill();
    if (e.stroke) ctx.stroke();

  } else if (e.type === 'line' || e.type === 'arrow') {
    const x2 = e.type === 'arrow' ? num(e.toX, e.x2 ?? currentX) : num(e.x2, currentX);
    const y2 = e.type === 'arrow' ? num(e.toY, e.y2 ?? currentY) : num(e.y2, currentY);
    const reveal = reducedMotion ? 1 : ease(Math.min(1, raw * 1.25));
    const endX = currentX + (x2 - currentX) * reveal;
    const endY = currentY + (y2 - currentY) * reveal;
    if (e.type === 'arrow') drawArrow(ctx, currentX, currentY, endX, endY, e.stroke || '#8ab4ff', num(e.strokeWidth, 4));
    else {
      ctx.beginPath(); ctx.moveTo(currentX, currentY); ctx.lineTo(endX, endY); ctx.stroke();
    }
    if (e.text && reveal > .35) {
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= ease((reveal - .35) / .65);
      ctx.font = `600 ${Math.max(16, num(e.fontSize, 20))}px Inter, Arial, sans-serif`;
      ctx.textAlign = annotationPosition ? 'center' : 'left';
      ctx.textBaseline = annotationPosition ? 'middle' : 'bottom';
      const textPosition = annotationPosition || { x: (currentX + endX) / 2 + 10, y: (currentY + endY) / 2 - 10 };
      ctx.fillText(e.text, textPosition.x, textPosition.y);
    }

  } else if (e.type === 'path') {
    const points = (e.points || []) as RuntimePoint[];
    if (points.length > 1) {
      const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
      let remaining = lengths.reduce((a, b) => a + b, 0) * (reducedMotion ? 1 : ease(Math.min(1, raw * 1.25)));
      ctx.shadowBlur = 0;
      ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length && remaining > 0; i++) {
        const from = points[i - 1], to = points[i], length = lengths[i - 1];
        if (remaining >= length) { ctx.lineTo(to.x, to.y); remaining -= length; }
        else {
          const f = remaining / Math.max(1, length);
          ctx.lineTo(lerp(from.x, to.x, f), lerp(from.y, to.y, f));
          remaining = 0;
        }
      }
      if (e.fill && raw >= .98) ctx.fill();
      if (e.stroke) ctx.stroke();
    }

  } else {
    const fontSize = Math.max(14, num(e.fontSize, 28));
    const text = String(e.text || '');
    ctx.shadowBlur = 0;
    ctx.fillStyle = e.fill || '#fff';
    ctx.font = `${e.fontWeight || 600} ${fontSize}px Inter, Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    if (e.type === 'equation' || equationText(text)) {
      drawEquation(ctx, text, currentX, currentY, Math.max(fontSize, 30), e.fill || '#fff', num(e.width, 520));
    } else {
      drawWrappedText(ctx, text, currentX, currentY, Math.max(180, num(e.width, 520)), fontSize * 1.35);
    }
  }

  ctx.restore();
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
) {
  const paragraphs = String(text).split(/\n+/);
  let row = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        ctx.fillText(line, x, y + row * lineHeight);
        row += 1; line = word;
      } else line = candidate;
    }
    if (line) { ctx.fillText(line, x, y + row * lineHeight); row += 1; }
  }
}

type TextBounds = { left: number; top: number; right: number; bottom: number };

function measuredTextWidth(ctx: CanvasRenderingContext2D, element: VisualLessonElement): number {
  const e = element as any;
  const fontSize = Math.max(14, num(e.fontSize, 28));
  const maxWidth = Math.max(180, num(e.width, 520));
  ctx.font = `${e.fontWeight || 600} ${fontSize}px Inter, Arial, sans-serif`;
  let widestLine = 0;

  for (const paragraph of String(e.text || '').split(/\n+/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        widestLine = Math.max(widestLine, ctx.measureText(line).width);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) widestLine = Math.max(widestLine, ctx.measureText(line).width);
  }

  return Math.max(80, Math.min(maxWidth, widestLine || 80));
}

function textLayoutBounds(
  ctx: CanvasRenderingContext2D,
  element: VisualLessonElement,
  x: number,
  y: number
): TextBounds {
  const e = element as any;
  const fontSize = Math.max(14, num(e.fontSize, 28));
  const lineHeight = fontSize * 1.35;
  const maxWidth = Math.max(180, num(e.width, 520));
  ctx.font = `${e.fontWeight || 600} ${fontSize}px Inter, Arial, sans-serif`;

  let widestLine = 0;
  let lineCount = 0;
  for (const paragraph of String(e.text || '').split(/\n+/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        widestLine = Math.max(widestLine, ctx.measureText(line).width);
        lineCount += 1;
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) {
      widestLine = Math.max(widestLine, ctx.measureText(line).width);
      lineCount += 1;
    }
  }

  const height = Math.max(fontSize, lineCount * lineHeight);
  return { left: x, top: y - height / 2, right: x + Math.min(maxWidth, widestLine) + 8, bottom: y + height / 2 };
}

function textOverlapsElement(
  bounds: TextBounds,
  element: VisualLessonElement,
  index: number,
  elements: VisualLessonElement[]
): boolean {
  const e = element as any;
  if (e.type === 'text' || e.type === 'label' || e.type === 'equation') {
    const other = elementBounds(element, index, elements);
    return bounds.left < other.right + 12 && bounds.right + 12 > other.left &&
      bounds.top < other.bottom + 8 && bounds.bottom + 8 > other.top;
  }

  if (e.type === 'rect') return false;

  const expanded = {
    left: bounds.left - 8,
    top: bounds.top - 8,
    right: bounds.right + 8,
    bottom: bounds.bottom + 8,
  };
  const segmentIntersects = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    let low = 0;
    let high = 1;
    const edges: Array<[number, number]> = [
      [-dx, x1 - expanded.left],
      [dx, expanded.right - x1],
      [-dy, y1 - expanded.top],
      [dy, expanded.bottom - y1],
    ];
    for (const [p, q] of edges) {
      if (p === 0) {
        if (q < 0) return false;
        continue;
      }
      const ratio = q / p;
      if (p < 0) low = Math.max(low, ratio);
      else high = Math.min(high, ratio);
      if (low > high) return false;
    }
    return true;
  };

  if (e.type === 'circle') {
    const center = elementCenter(element);
    const nearestX = Math.max(expanded.left, Math.min(center.x, expanded.right));
    const nearestY = Math.max(expanded.top, Math.min(center.y, expanded.bottom));
    return Math.hypot(center.x - nearestX, center.y - nearestY) <= num(e.radius, 20) + 8;
  }

  if (e.type === 'line' || e.type === 'arrow') {
    const x1 = num(e.type === 'arrow' ? e.fromX : e.x, 0);
    const y1 = num(e.type === 'arrow' ? e.fromY : e.y, 0);
    const x2 = num(e.type === 'arrow' ? e.toX : e.x2, x1);
    const y2 = num(e.type === 'arrow' ? e.toY : e.y2, y1);
    return segmentIntersects(x1, y1, x2, y2);
  }

  if (e.type === 'path' && Array.isArray(e.points)) {
    return e.points.slice(1).some((point: RuntimePoint, pointIndex: number) => {
      const previous = e.points[pointIndex];
      return segmentIntersects(num(previous.x), num(previous.y), num(point.x), num(point.y));
    });
  }

  return false;
}

function layoutSceneText(
  ctx: CanvasRenderingContext2D,
  elements: VisualLessonElement[],
  lessonWidth: number,
  lessonHeight: number
): { positions: Map<number, RuntimePoint>; arrowTextPositions: Map<number, RuntimePoint> } {
  const positions = new Map<number, RuntimePoint>();
  const arrowTextPositions = new Map<number, RuntimePoint>();
  const occupied: Array<{ index: number; bounds: TextBounds }> = [];

  elements.forEach((element, index) => {
    if (element.type !== 'text' && element.type !== 'label' && element.type !== 'equation') return;
    const e = element as any;
    const width = measuredTextWidth(ctx, element);
    const fontSize = Math.max(14, num(e.fontSize, 28));
    const height = Math.max(fontSize, fontSize * 1.35);
    const relativeTo = e.relativeTo || e.anchor || e.position?.relativeTo;
    const anchorIndex = relativeTo
      ? elements.findIndex((candidate, candidateIndex) => elementId(candidate, candidateIndex) === relativeTo)
      : -1;
    const anchor = anchorIndex >= 0 ? elementBounds(elements[anchorIndex], anchorIndex, elements) : undefined;
    const relation = e.position?.relation || e.relation || 'below';
    const gap = Math.max(12, num(e.gap, 36));
    const preferred = resolveElementPosition(element, index, elements);
    const candidates: RuntimePoint[] = [];

    if (Number.isFinite(e.x) && Number.isFinite(e.y)) candidates.push({ x: num(e.x), y: num(e.y) });
    if (anchor) {
      const centerX = (anchor.left + anchor.right) / 2;
      const centerY = (anchor.top + anchor.bottom) / 2;
      const sidePositions: Record<string, RuntimePoint> = {
        right: { x: anchor.right + gap, y: centerY },
        left: { x: anchor.left - gap - width, y: centerY },
        above: { x: centerX - width / 2, y: anchor.top - gap - height / 2 },
        below: { x: centerX - width / 2, y: anchor.bottom + gap + height / 2 },
      };
      candidates.push(sidePositions[relation] || sidePositions.below);
      for (const side of ['right', 'left', 'above', 'below']) candidates.push(sidePositions[side]);
    } else {
      candidates.push(preferred);
    }

    for (let offset = 24; offset <= 288; offset += 24) {
      candidates.push(
        { x: preferred.x, y: preferred.y - offset },
        { x: preferred.x, y: preferred.y + offset },
        { x: preferred.x + offset, y: preferred.y },
        { x: preferred.x - offset - width, y: preferred.y }
      );
    }

    const placed = candidates.find((candidate) => {
      const x = Math.max(12, Math.min(candidate.x, lessonWidth - width - 12));
      const y = Math.max(height / 2 + 8, Math.min(candidate.y, lessonHeight - height / 2 - 8));
      const bounds = textLayoutBounds(ctx, element, x, y);
      const hitsText = occupied.some((other) =>
        bounds.left < other.bounds.right + 12 && bounds.right + 12 > other.bounds.left &&
        bounds.top < other.bounds.bottom + 8 && bounds.bottom + 8 > other.bounds.top
      );
      const hitsDiagram = elements.some((other, otherIndex) =>
        otherIndex !== index &&
        other.type !== 'text' && other.type !== 'label' && other.type !== 'equation' &&
        textOverlapsElement(bounds, other, otherIndex, elements)
      );
      return !hitsText && !hitsDiagram;
    }) || candidates[0] || preferred;

    const position = {
      x: Math.max(12, Math.min(placed.x, lessonWidth - width - 12)),
      y: Math.max(height / 2 + 8, Math.min(placed.y, lessonHeight - height / 2 - 8)),
    };
    positions.set(index, position);
    occupied.push({ index, bounds: textLayoutBounds(ctx, element, position.x, position.y) });
  });

  elements.forEach((element, index) => {
    const e = element as any;
    if (element.type !== 'arrow' || !String(e.text || '').trim()) return;

    const start = resolveElementPosition(element, index, elements);
    const x1 = Number.isFinite(e.fromX) ? num(e.fromX) : start.x;
    const y1 = Number.isFinite(e.fromY) ? num(e.fromY) : start.y;
    const x2 = Number.isFinite(e.toX) ? num(e.toX) : num(e.x2, x1);
    const y2 = Number.isFinite(e.toY) ? num(e.toY) : num(e.y2, y1);
    const fontSize = Math.max(16, num(e.fontSize, 20));
    ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
    const width = Math.max(80, ctx.measureText(String(e.text)).width);
    const height = fontSize * 1.35;
    const midpoint = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
    const gap = 18;
    const candidates: RuntimePoint[] = [
      { x: midpoint.x, y: midpoint.y - height / 2 - gap },
      { x: midpoint.x, y: midpoint.y + height / 2 + gap },
      { x: midpoint.x - width / 2 - gap, y: midpoint.y },
      { x: midpoint.x + width / 2 + gap, y: midpoint.y },
    ];
    for (let offset = 24; offset <= 192; offset += 24) {
      candidates.push(
        { x: midpoint.x, y: midpoint.y - height / 2 - gap - offset },
        { x: midpoint.x, y: midpoint.y + height / 2 + gap + offset }
      );
    }

    const placed = candidates.find((candidate) => {
      const centerX = Math.max(width / 2 + 12, Math.min(candidate.x, lessonWidth - width / 2 - 12));
      const centerY = Math.max(height / 2 + 8, Math.min(candidate.y, lessonHeight - height / 2 - 8));
      const bounds = {
        left: centerX - width / 2,
        top: centerY - height / 2,
        right: centerX + width / 2,
        bottom: centerY + height / 2,
      };
      const hitsText = occupied.some((other) =>
        bounds.left < other.bounds.right + 12 && bounds.right + 12 > other.bounds.left &&
        bounds.top < other.bounds.bottom + 8 && bounds.bottom + 8 > other.bounds.top
      );
      const hitsDiagram = elements.some((other, otherIndex) =>
        otherIndex !== index &&
        other.type !== 'text' && other.type !== 'label' && other.type !== 'equation' &&
        textOverlapsElement(bounds, other, otherIndex, elements)
      );
      return !hitsText && !hitsDiagram;
    }) || candidates[0];

    const position = {
      x: Math.max(width / 2 + 12, Math.min(placed.x, lessonWidth - width / 2 - 12)),
      y: Math.max(height / 2 + 8, Math.min(placed.y, lessonHeight - height / 2 - 8)),
    };
    arrowTextPositions.set(index, position);
    occupied.push({ index, bounds: {
      left: position.x - width / 2,
      top: position.y - height / 2,
      right: position.x + width / 2,
      bottom: position.y + height / 2,
    } });
  });

  return { positions, arrowTextPositions };
}

const sceneTextLayoutCache = new WeakMap<VisualLessonElement[], {
  width: number;
  height: number;
  positions: Map<number, RuntimePoint>;
  arrowTextPositions: Map<number, RuntimePoint>;
}>();

function sentencesOf(narration: string): string[] {
  return narration.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((part) => part.trim()).filter(Boolean)
    || (narration.trim() ? [narration.trim()] : []);
}

function narrationSentenceAt(narration: string, elapsedMs: number, durationMs: number): string {
  const sentences = sentencesOf(narration);
  if (!sentences.length) return '';
  const total = sentences.reduce((sum, s) => sum + s.length, 0) || 1;
  const target = Math.min(total - 1, Math.max(0, elapsedMs / Math.max(1, durationMs) * total));
  let acc = 0;
  for (const sentence of sentences) { acc += sentence.length; if (target < acc) return sentence; }
  return sentences[sentences.length - 1];
}

function drawSubtitle(ctx: CanvasRenderingContext2D, width: number, height: number, text: string) {
  if (!text) return;
  const x = 54, w = width - 108, h = 70, y = height - h - 28;
  ctx.save();
  ctx.fillStyle = 'rgba(2,6,15,.72)';
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '600 28px Inter, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  drawWrappedText(ctx, text, x + 22, y + 34, w - 44, 36);
  ctx.restore();
}

function drawSceneElements(
  ctx: CanvasRenderingContext2D,
  scene: VisualLesson['scenes'][number],
  sceneTime: number,
  sceneDuration: number,
  lessonWidth: number,
  lessonHeight: number,
  reducedMotion = false
) {
  const elements = scene.elements || [];
  if (!elements.length) return;

  const beats = getBeats(scene, sceneDuration);
  let cachedLayout = sceneTextLayoutCache.get(elements);
  if (!cachedLayout || cachedLayout.width !== lessonWidth || cachedLayout.height !== lessonHeight) {
    cachedLayout = {
      width: lessonWidth,
      height: lessonHeight,
      ...layoutSceneText(ctx, elements, lessonWidth, lessonHeight),
    };
    sceneTextLayoutCache.set(elements, cachedLayout);
  }
  const textPositions = cachedLayout.positions;
  const unspecified = elements.filter((el) => (el as any).delayMs == null);
  const usable = Math.max(1000, sceneDuration - 600);
  const beatGap = unspecified.length > 1 ? Math.min(850, usable / Math.max(1, unspecified.length - 1)) : 0;

  elements.forEach((element, index) => {
    const e = element as any;
    const defaultDelay = e.delayMs == null
      ? Math.max(0, Math.min(usable - 400, index * beatGap))
      : 0;
    const defaultDuration = e.durationMs == null
      ? Math.min(900, Math.max(360, sceneDuration * .15))
      : num(e.durationMs, 600);

    // A semantic beat overrides the generic stagger when supplied.
    const id = elementId(element, index);
    const beat = beats.find((b) => b.targetId === id);
    const delay = beat?.startMs != null ? num(beat.startMs) : defaultDelay;
    const duration = beat?.durationMs != null ? num(beat.durationMs, defaultDuration) : defaultDuration;

    drawElement(ctx, element, sceneTime, delay, duration, elements, index, scene, sceneDuration, lessonWidth, reducedMotion, textPositions.get(index), cachedLayout.arrowTextPositions.get(index));
  });
}

function validateLessonRuntime(lesson: VisualLesson) {
  const issues: string[] = [];
  const ids = new Set<string>();
  lesson.scenes.forEach((scene, sceneIndex) => {
    const elements = scene.elements || [];
    elements.forEach((el, index) => {
      const id = elementId(el, index);
      if (ids.has(`${sceneIndex}:${id}`)) issues.push(`Scene ${sceneIndex + 1}: duplicate element id "${id}".`);
      ids.add(`${sceneIndex}:${id}`);
      const e = el as any;
      if (Number.isFinite(e.x) && Math.abs(e.x) > lesson.width * 3) issues.push(`Scene ${sceneIndex + 1}: "${id}" is far outside the canvas.`);
      if (Number.isFinite(e.y) && Math.abs(e.y) > lesson.height * 3) issues.push(`Scene ${sceneIndex + 1}: "${id}" is far outside the canvas.`);
    });
    if (!scene.narration?.trim()) issues.push(`Scene ${sceneIndex + 1}: missing narration.`);
    if (!Number.isFinite(scene.durationMs) || scene.durationMs <= 0) issues.push(`Scene ${sceneIndex + 1}: invalid duration.`);
  });
  return issues;
}

function drawFrame(
  canvas: HTMLCanvasElement,
  lesson: VisualLesson,
  sceneIndex: number,
  sceneTime: number,
  sceneDuration = lesson.scenes[sceneIndex]?.durationMs || 6000,
  reducedMotion = false,
  mode: 'cinematic' | 'whiteboard' | 'presentation' | 'diagram' = 'cinematic'
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const scene = lesson.scenes[sceneIndex];
  if (!scene) return;

  const scale = Math.min(canvas.width / lesson.width, canvas.height / lesson.height);
  const logicalWidth = canvas.width / scale;
  const logicalHeight = canvas.height / scale;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  // Premium dark teaching surface.
  const bg = ctx.createLinearGradient(0, 0, logicalWidth, logicalHeight);
  if (mode === 'whiteboard') {
    bg.addColorStop(0, '#f7f8fa'); bg.addColorStop(1, '#e9edf2');
  } else if (mode === 'presentation') {
    bg.addColorStop(0, '#111827'); bg.addColorStop(1, '#020617');
  } else {
    bg.addColorStop(0, '#07111f'); bg.addColorStop(0.55, '#0b1424'); bg.addColorStop(1, '#050912');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logicalWidth, logicalHeight);

  // Very subtle grid gives diagrams a designed canvas without looking noisy.
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = mode === 'whiteboard' ? '#64748b' : '#9fb7d9';
  ctx.lineWidth = 1;
  const grid = 40;
  for (let x = 0; x <= logicalWidth; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, logicalHeight); ctx.stroke();
  }
  for (let y = 0; y <= logicalHeight; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(logicalWidth, y); ctx.stroke();
  }
  ctx.restore();

  // Header.
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.roundRect(42, 36, 5, 74, 2.5);
  ctx.fill();

  ctx.fillStyle = '#91a4bf';
  ctx.font = '700 14px Inter, Arial, sans-serif';
    ctx.font = '700 18px Inter, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `LESSON ${String(sceneIndex + 1).padStart(2, '0')}  /  ${String(lesson.scenes.length).padStart(2, '0')}`,
    64,
    36
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = '750 30px Inter, Arial, sans-serif';
  ctx.font = '750 44px Inter, Arial, sans-serif';
  drawWrappedText(ctx, scene.title, 64, 64, logicalWidth - 128, 50);

  if (scene.caption) {
    ctx.fillStyle = '#aebbd0';
    ctx.font = '500 16px Inter, Arial, sans-serif';
    ctx.font = '500 21px Inter, Arial, sans-serif';
    drawWrappedText(ctx, scene.caption, 64, 122, logicalWidth - 128, 28);
  }

  // Main teaching canvas.
  const contentX = 38;
  const contentY = 150;
  const contentWidth = logicalWidth - 76;
  const contentHeight = logicalHeight - 270;

  const panel = ctx.createLinearGradient(contentX, contentY, contentX, contentY + contentHeight);
  panel.addColorStop(0, 'rgba(16, 29, 49, .92)');
  panel.addColorStop(1, 'rgba(7, 14, 26, .96)');
  ctx.fillStyle = panel;
  ctx.strokeStyle = 'rgba(173, 202, 239, .16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(contentX, contentY, contentWidth, contentHeight, 22);
  ctx.fill();
  ctx.stroke();

  // Diagram area uses the lesson coordinate system exactly once.
  const padding = 28;
  const viewportWidth = contentWidth - padding * 2;
  const viewportHeight = contentHeight - padding * 2;
  const frameAspect = viewportWidth / viewportHeight;
  const visibleWidth = Math.min(lesson.width, lesson.height * frameAspect);
  const diagramScale = viewportWidth / visibleWidth;
  const diagramX = contentX + (contentWidth - lesson.width * diagramScale) / 2;
  const diagramY = contentY + (contentHeight - lesson.height * diagramScale) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(contentX + 8, contentY + 8, contentWidth - 16, contentHeight - 16, 16);
  ctx.clip();
  const camera = cameraAt(
    scene,
    sceneTime,
    scene.elements || [],
    lesson.width,
    lesson.height,
    reducedMotion,
    sceneDuration,
    frameAspect
  );
  ctx.translate(
    diagramX + (lesson.width * diagramScale) / 2,
    diagramY + (lesson.height * diagramScale) / 2
  );
  ctx.scale(diagramScale * camera.zoom, diagramScale * camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  drawSceneElements(ctx, scene, sceneTime, sceneDuration, lesson.width, lesson.height, reducedMotion);
  ctx.restore();

  drawSubtitle(ctx, logicalWidth, logicalHeight, narrationSentenceAt(scene.narration, sceneTime, sceneDuration));

  ctx.restore();
}

function drawVeoCompositeFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  lesson: VisualLesson,
  sceneIndex: number,
  sceneTime: number,
  captionTime: number,
  sceneDuration: number
) {
  const ctx = canvas.getContext('2d');
  const scene = lesson.scenes[sceneIndex];
  if (!ctx || !scene) return;

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#050912';
  ctx.fillRect(0, 0, width, height);

  // Full-bleed cinematic video. Do not reduce the generated video to a
  // side-panel: the generated footage is the primary visual.
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    const videoRatio = video.videoWidth / Math.max(1, video.videoHeight);
    const canvasRatio = width / Math.max(1, height);
    let sx = 0;
    let sy = 0;
    let sw = video.videoWidth;
    let sh = video.videoHeight;

    if (videoRatio > canvasRatio) {
      sw = video.videoHeight * canvasRatio;
      sx = (video.videoWidth - sw) / 2;
    } else {
      sh = video.videoWidth / canvasRatio;
      sy = (video.videoHeight - sh) / 2;
    }

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  }

  // Cinematic readability overlays.
  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(3, 7, 18, .76)');
  shade.addColorStop(.24, 'rgba(3, 7, 18, .04)');
  shade.addColorStop(.64, 'rgba(3, 7, 18, .06)');
  shade.addColorStop(1, 'rgba(3, 7, 18, .94)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  // Small professional lesson marker.
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.roundRect(48, 44, 5, 72, 2.5);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.76)';
  ctx.font = '700 17px Inter, Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(
    `LESSON ${String(sceneIndex + 1).padStart(2, '0')}  /  ${String(lesson.scenes.length).padStart(2, '0')}`,
    70,
    44
  );

  ctx.fillStyle = '#ffffff';
  ctx.font = '750 38px Inter, Arial, sans-serif';
  drawWrappedText(ctx, scene.title, 70, 72, width - 140, 44);

  // Veo is cinematic B-roll. The deterministic semantic lesson layer remains authoritative
  // and is rendered on top using the same narration-driven clock as the normal lesson.
  const sceneElements = scene.elements || [];
  const camera = cameraAt(
    scene,
    sceneTime,
    sceneElements,
    lesson.width,
    lesson.height,
    false,
    sceneDuration,
    (width - 108) / (height - 290)
  );
  const diagramScale = fitVisualLessonScale(width - 132, height - 342, lesson.width, lesson.height);
  const diagramX = 66 + (width - 132 - lesson.width * diagramScale) / 2;
  const diagramY = 171 + (height - 342 - lesson.height * diagramScale) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(54, 162, width - 108, height - 290, 20);
  ctx.clip();
  ctx.translate(diagramX + (lesson.width * diagramScale) / 2, diagramY + (lesson.height * diagramScale) / 2);
  ctx.scale(diagramScale * camera.zoom, diagramScale * camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  drawSceneElements(ctx, scene, sceneTime, sceneDuration, lesson.width, lesson.height, false);
  ctx.restore();

  // Compact lower-third caption instead of a giant opaque box.
  const narration = scene.narration.trim();
  const caption = narrationSentenceAt(narration, captionTime, sceneDuration);
  if (caption) {
    const captionX = 54;
    const captionWidth = width - 108;
    const captionY = height - 132;

    ctx.fillStyle = 'rgba(3, 7, 18, .74)';
    ctx.beginPath();
    ctx.roundRect(captionX, captionY, captionWidth, 82, 18);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 23px Inter, Arial, sans-serif';
    ctx.textBaseline = 'middle';
    drawWrappedText(ctx, caption, captionX + 26, captionY + 29, captionWidth - 52, 29);
  }
}

function formatTime(ms: number) { const total = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(total / 60); const sec = total % 60; return `${m}:${String(sec).padStart(2, '0')}`; }

export function VisualLessonPlayer({ lesson, videoClips = [] }: { lesson: VisualLesson; videoClips?: VisualLessonVideoClip[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const veoVideosRef = useRef(new Map<number, HTMLVideoElement>());
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const frameRef = useRef<number | null>(null);
  const activeAudioSceneRef = useRef(-1);
  const audioLoadTokenRef = useRef(0);
  const voiceGenerationRef = useRef<Promise<{ urls: string[]; durations: number[] }> | null>(null);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [muted, setMuted] = useState(false);
  const [audioUrls, setAudioUrls] = useState<string[]>([]);
  const [audioDurations, setAudioDurations] = useState<number[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingScene, setExportingScene] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showChapters, setShowChapters] = useState(true);
  const [lessonMode, setLessonMode] = useState<'cinematic' | 'whiteboard' | 'presentation' | 'diagram'>('cinematic');
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [note, setNote] = useState('');
  const [checkpointAnswer, setCheckpointAnswer] = useState<number | null>(null);
  const sceneDurations = useMemo(
    () => lesson.scenes.map((scene, index) => audioDurations[index] || scene.durationMs),
    [audioDurations, lesson.scenes]
  );
  const duration = useMemo(() => sceneDurations.reduce((sum, value) => sum + value, 0), [sceneDurations]);

  const locate = useCallback((absoluteMs: number) => {
    let remaining = Math.max(0, Math.min(duration, absoluteMs));
    for (let i = 0; i < lesson.scenes.length; i++) {
      if (remaining < sceneDurations[i] || i === lesson.scenes.length - 1) return { index: i, local: remaining };
      remaining -= sceneDurations[i];
    }
    return { index: 0, local: 0 };
  }, [duration, lesson.scenes, sceneDurations]);

  const draw = useCallback((absoluteMs: number) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const found = locate(absoluteMs);
    const audio = audioRef.current;
    const visualTime = activeAudioSceneRef.current === found.index
      && audio
      && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      ? audio.currentTime * 1000
      : found.local;
    drawFrame(canvas, lesson, found.index, visualTime, sceneDurations[found.index], reducedMotion, lessonMode);
  }, [lesson, locate, sceneDurations, reducedMotion, lessonMode]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(lesson.width * dpr); canvas.height = Math.round(lesson.height * dpr);
    draw(0);
  }, [draw, lesson.height, lesson.width]);

  useEffect(() => {
    const redraw = () => draw(position);
    window.addEventListener('visual-lesson-math-ready', redraw);
    return () => window.removeEventListener('visual-lesson-math-ready', redraw);
  }, [draw, position]);

  const syncAudio = useCallback((index: number, localMs: number, urls: string[], shouldPlay: boolean, forceAudible = false) => {
    const audio = audioRef.current;
    const url = urls[index];
    if (!audio || !url) {
      audio?.pause();
      activeAudioSceneRef.current = -1;
      return;
    }

    const isNewScene = activeAudioSceneRef.current !== index || audio.src !== url;
    if (isNewScene) {
      audioLoadTokenRef.current += 1;
      const loadToken = audioLoadTokenRef.current;
      activeAudioSceneRef.current = index;
      audio.pause();
      audio.src = url;
      audio.load();
      const startTrack = () => {
        if (loadToken !== audioLoadTokenRef.current) return;
        audio.currentTime = Math.min(localMs / 1000, Number.isFinite(audio.duration) ? audio.duration : localMs / 1000);
        audio.playbackRate = speed;
        if (shouldPlay && (!muted || forceAudible)) {
          void audio.play().catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'Narration playback was blocked by the browser.');
          });
        }
      };
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) startTrack();
      else audio.addEventListener('loadedmetadata', startTrack, { once: true });
      return;
    }

    const expectedTime = localMs / 1000;
    if (Math.abs(audio.currentTime - expectedTime) > 0.75) {
      audio.currentTime = Math.min(expectedTime, Number.isFinite(audio.duration) ? audio.duration : expectedTime);
    }
    audio.playbackRate = speed;
    if (!shouldPlay || (muted && !forceAudible)) {
      audio.pause();
    } else if (audio.paused) {
      void audio.play().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Narration playback was blocked by the browser.');
      });
    }
  }, [muted, speed]);

  const tick = useCallback(() => {
    if (!playing) return;
    const wallClock = pausedAtRef.current + (performance.now() - startedAtRef.current) * speed;
    const wallFound = locate(wallClock);
    const audio = audioRef.current;
    let current = wallClock;
    if (audio && activeAudioSceneRef.current === wallFound.index && audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const sceneStart = sceneDurations.slice(0, wallFound.index).reduce((sum, value) => sum + value, 0);
      current = Math.min(duration, sceneStart + audio.currentTime * 1000);
    }
    setPosition(current);
    draw(current);
    const found = locate(current);
    syncAudio(found.index, found.local, audioUrls, true);
    if (current >= duration - 20) {
      setPlaying(false);
      pausedAtRef.current = duration;
      audio?.pause();
      return;
    }
    frameRef.current = requestAnimationFrame(tick);
  }, [audioUrls, duration, draw, locate, playing, sceneDurations, speed, syncAudio]);
  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); }, []);
  useEffect(() => { if (playing) { startedAtRef.current = performance.now(); frameRef.current = requestAnimationFrame(tick); } }, [playing, tick]);

  const ensureAudioGraph = async () => {
    if (!audioRef.current) audioRef.current = new Audio();
    if (!audioContextRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AC();
      destinationRef.current = audioContextRef.current.createMediaStreamDestination();
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioRef.current);
      sourceRef.current.connect(audioContextRef.current.destination);
      sourceRef.current.connect(destinationRef.current);
    }
    if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
  };

  const readAudioDuration = (url: string): Promise<number> => new Promise((resolve, reject) => {
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const audioDuration = probe.duration;
      probe.removeAttribute('src');
      probe.load();
      if (!Number.isFinite(audioDuration) || audioDuration <= 0) {
        reject(new Error('Narration audio has no readable duration.'));
        return;
      }
      resolve(audioDuration * 1000);
    };
    probe.onerror = () => reject(new Error('Could not read the generated narration audio.'));
    probe.src = url;
  });

  const generateVoice = useCallback((): Promise<{ urls: string[]; durations: number[] }> => {
    if (voiceGenerationRef.current) return voiceGenerationRef.current;
    if (!lesson.scenes.length) return Promise.resolve({ urls: [], durations: [] });

    setVoiceLoading(true);
    setError('');
    const generation = (async () => {
      try {
        const urls: string[] = [];
        for (const scene of lesson.scenes) {
          if (!scene.narration.trim()) { urls.push(''); continue; }
          const result = await generateNarration({
            text: scene.narration,
            voice: lesson.voice?.name || 'Kore',
            language: lesson.voice?.language,
          });
          urls.push(result.audioDataUrl);
        }
        const durations = await Promise.all(urls.map((url) => url ? readAudioDuration(url) : Promise.resolve(0)));
        setAudioUrls(urls);
        setAudioDurations(durations);
        await ensureAudioGraph();
        return { urls, durations };
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Voice generation failed.';
        setError(message);
        throw cause;
      } finally {
        voiceGenerationRef.current = null;
        setVoiceLoading(false);
      }
    })();
    voiceGenerationRef.current = generation;
    return generation;
  }, [lesson.scenes, lesson.voice]);

  const play = async () => {
    setError('');
    try {
      await ensureAudioGraph();
      let urls = audioUrls;
      if (urls.length !== lesson.scenes.length) {
        const generated = await generateVoice();
        urls = generated.urls;
      }
      if (position >= duration) { pausedAtRef.current = 0; setPosition(0); draw(0); }
      const startAt = position >= duration ? 0 : position;
      const found = locate(startAt);
      syncAudio(found.index, found.local, urls, true);
      startedAtRef.current = performance.now();
      pausedAtRef.current = startAt;
      setPlaying(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start narrated playback.');
    }
  };
  const pause = () => { pausedAtRef.current = position; setPlaying(false); audioRef.current?.pause(); if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  const reset = () => { pause(); pausedAtRef.current = 0; setPosition(0); draw(0); if (audioRef.current) audioRef.current.currentTime = 0; };
  const seek = (value: number) => {
    pausedAtRef.current = value;
    setPosition(value);
    draw(value);
    const found = locate(value);
    syncAudio(found.index, found.local, audioUrls, playing);
    if (playing) startedAtRef.current = performance.now();
  };

  const startExportAudio = async (url: string) => {
    const audio = audioRef.current;
    if (!audio) throw new Error('Audio recording is unavailable.');
    if (!url) {
      audio.pause();
      return;
    }

    audioLoadTokenRef.current += 1;
    audio.pause();
    audio.src = url;
    audio.load();
    if (audio.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error('Narration audio did not load for video export.'));
        }, 15000);
        const loaded = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error('Narration audio failed to load for video export.')); };
        const cleanup = () => {
          window.clearTimeout(timeout);
          audio.removeEventListener('loadedmetadata', loaded);
          audio.removeEventListener('error', failed);
        };
        audio.addEventListener('loadedmetadata', loaded, { once: true });
        audio.addEventListener('error', failed, { once: true });
      });
    }
    audio.currentTime = 0;
    audio.playbackRate = 1;
    await audio.play();
  };

  const playVeoSceneWithNarration = async (sceneIndex: number) => {
    setError('');
    try {
      let generated = { urls: audioUrls, durations: audioDurations };
      if (generated.urls.length !== lesson.scenes.length) generated = await generateVoice();
      const scene = lesson.scenes[sceneIndex];
      const clip = videoClips.find((item) => item.sceneIndex === sceneIndex);
      const video = veoVideosRef.current.get(sceneIndex);
      const narrationUrl = generated.urls[sceneIndex];
      const narrationDuration = generated.durations[sceneIndex] || scene?.durationMs || 0;
      if (!scene || !clip || !video) throw new Error('This generated video scene is unavailable.');
      if (!narrationUrl) throw new Error('This scene has no generated narration.');
      await ensureAudioGraph();
      video.pause();
      video.loop = true;
      video.currentTime = 0;
      await startExportAudio(narrationUrl);
      await video.play();
      const started = performance.now();
      const sync = () => {
        const audio = audioRef.current;
        if (!audio || audio.paused) return;
        if (Number.isFinite(video.duration) && video.duration > 0) {
          // The narration is the master clock. The cinematic clip is allowed to
          // loop, but it can never drift away from the spoken timeline.
          video.currentTime = ((audio.currentTime * 1000) % (video.duration * 1000)) / 1000;
        }
        if (performance.now() - started < Math.max(narrationDuration, 1) + 100) requestAnimationFrame(sync);
      };
      requestAnimationFrame(sync);
      const narrationAudio = audioRef.current;
      if (narrationAudio) {
        narrationAudio.onended = () => {
          video.pause();
          video.currentTime = 0;
          narrationAudio.onended = null;
        };
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not play the video with its narration.');
    }
  };

  const exportNarratedVeoScene = async (sceneIndex: number) => {
    if (exportingScene !== null) return;
    setExportingScene(sceneIndex);
    setError('');
    let combined: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    try {
      let generated = { urls: audioUrls, durations: audioDurations };
      if (generated.urls.length !== lesson.scenes.length) generated = await generateVoice();
      const scene = lesson.scenes[sceneIndex];
      const clip = videoClips.find((item) => item.sceneIndex === sceneIndex);
      const video = veoVideosRef.current.get(sceneIndex);
      const narrationUrl = generated.urls[sceneIndex];
      const captureVideoStream = (video as HTMLVideoElement & { captureStream?: () => MediaStream } | null)?.captureStream;
      if (!scene || !clip || !video || !narrationUrl) {
        throw new Error('The video scene or its narration is unavailable.');
      }
      if (!captureVideoStream || !window.MediaRecorder) {
        throw new Error('This browser cannot export a narrated MP4.');
      }

      await ensureAudioGraph();
      video.pause();
      video.currentTime = 0;
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error('The generated video did not load for export.'));
          }, 15000);
          const loaded = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error('The generated video failed to load for export.')); };
          const cleanup = () => {
            window.clearTimeout(timeout);
            video.removeEventListener('loadedmetadata', loaded);
            video.removeEventListener('error', failed);
          };
          video.addEventListener('loadedmetadata', loaded, { once: true });
          video.addEventListener('error', failed, { once: true });
        });
      }

      const videoDuration = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
      const recordingDuration = generated.durations[sceneIndex] || videoDuration;
      if (!recordingDuration) throw new Error('The narration and video durations could not be measured.');
      const videoStream = captureVideoStream.call(video);
      combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...(destinationRef.current?.stream.getAudioTracks() || []),
      ]);
      if (!combined.getVideoTracks().length || !combined.getAudioTracks().length) {
        throw new Error('The browser could not prepare both video and narration tracks.');
      }

      recorder = createMp4Recorder(combined);
      const mime = recorder.mimeType || 'video/mp4';
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const stopped = new Promise<void>((resolve, reject) => {
        recorder!.onstop = () => resolve();
        recorder!.onerror = () => reject(new Error('The narrated video export failed while recording.'));
      });
      recorder.start(250);
      video.loop = true;
      await Promise.all([startExportAudio(narrationUrl), video.play()]);
      await new Promise<void>((resolve) => {
        const startedAt = performance.now();
        const sync = () => {
          const audio = audioRef.current;
          if (audio && !audio.paused && Number.isFinite(video.duration) && video.duration > 0) {
            video.currentTime = ((audio.currentTime * 1000) % (video.duration * 1000)) / 1000;
          }
          if (!audio || audio.ended || performance.now() - startedAt >= recordingDuration + 100) {
            resolve();
            return;
          }
          requestAnimationFrame(sync);
        };
        requestAnimationFrame(sync);
      });
      video.pause();
      audioRef.current?.pause();
      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error('The narrated video export produced an empty file.');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${clip.filename.replace(/\.(?:mp4|webm)$/i, '')}-narrated.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export the narrated video scene.');
    } finally {
      recorder?.stream.getTracks().forEach((track) => track.stop());
      combined?.getTracks().forEach((track) => track.stop());
      setExportingScene(null);
    }
  };

  const exportVideo = async () => {
    if (exporting) return;
    setExporting(true); setError('');
    if (playing) pause();
    let recorder: MediaRecorder | undefined;
    let stream: MediaStream | undefined;
    try {
      const generated = audioUrls.length === lesson.scenes.length
        ? { urls: audioUrls, durations: audioDurations }
        : await generateVoice();
      const { urls, durations } = generated;
      const clipsByScene = new Map(videoClips.map((clip) => [clip.sceneIndex, clip]));
      const hasAllVeoClips = lesson.scenes.every((_, index) => clipsByScene.has(index));
      if (!urls.some(Boolean)) throw new Error('This lesson has no narration to include in the video.');
      if (!exportCanvasRef.current || !window.MediaRecorder) throw new Error('This browser does not support video recording.');
      await ensureAudioGraph();
      const exportCanvas = exportCanvasRef.current;
      exportCanvas.width = 1280;
      exportCanvas.height = 720;
      const canvasStream = exportCanvas.captureStream(30);
      stream = new MediaStream([...canvasStream.getVideoTracks(), ...(destinationRef.current?.stream.getAudioTracks() || [])]);
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) {
        throw new Error('Could not combine generated video with its narration audio.');
      }
      recorder = createMp4Recorder(stream);
      const mime = recorder.mimeType || 'video/mp4';
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const recordingStopped = new Promise<void>((resolve, reject) => {
        recorder!.onstop = () => resolve();
        recorder!.onerror = () => reject(new Error('Video recording failed.'));
      });
      recorder.start(250);

      for (let i = 0; i < lesson.scenes.length; i++) {
        const scene = lesson.scenes[i];
        const hasVideoClip = clipsByScene.has(i);
        const video = hasVideoClip ? veoVideosRef.current.get(i) : undefined;
        if (hasVideoClip && !video) {
          throw new Error(`The generated video for scene ${i + 1} is unavailable.`);
        }
        if (video) {
          video.loop = true;
          video.pause();
          video.currentTime = 0;
          if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
            await new Promise<void>((resolve, reject) => {
              const timeout = window.setTimeout(() => {
                cleanup();
                reject(new Error(`Generated scene ${i + 1} did not load in time.`));
              }, 20000);
              const loaded = () => { cleanup(); resolve(); };
              const failed = () => { cleanup(); reject(new Error(`Generated scene ${i + 1} could not be loaded.`)); };
              const cleanup = () => {
                window.clearTimeout(timeout);
                video.removeEventListener('loadedmetadata', loaded);
                video.removeEventListener('error', failed);
              };
              video.addEventListener('loadedmetadata', loaded, { once: true });
              video.addEventListener('error', failed, { once: true });
            });
          }
        }
        const videoDuration = video && Number.isFinite(video.duration) ? video.duration * 1000 : 0;
        const sceneDuration = durations[i] || Math.max(videoDuration, scene.durationMs);
        if (video) await Promise.all([startExportAudio(urls[i]), video.play()]);
        else await startExportAudio(urls[i]);
        const sceneStartedAt = performance.now();
        await new Promise<void>((resolve) => {
          const renderFrame = () => {
            const wallElapsed = Math.min(sceneDuration, performance.now() - sceneStartedAt);
            const narrationElapsed = urls[i] && audioRef.current
              ? Math.min(sceneDuration, audioRef.current.currentTime * 1000)
              : wallElapsed;
            if (video && Number.isFinite(video.duration) && video.duration > 0) {
              video.currentTime = ((narrationElapsed % (video.duration * 1000)) / 1000);
            }
            if (video) {
              drawVeoCompositeFrame(
                exportCanvas,
                video,
                lesson,
                i,
                narrationElapsed,
                narrationElapsed,
                sceneDuration
              );
            } else {
              drawFrame(exportCanvas, lesson, i, narrationElapsed, sceneDuration);
            }
            const audioDone = !!audioRef.current && (audioRef.current.ended || narrationElapsed >= sceneDuration - 20);
            if (audioDone || wallElapsed >= sceneDuration + 250) {
              resolve();
              return;
            }
            requestAnimationFrame(renderFrame);
          };
          requestAnimationFrame(renderFrame);
        });
        video?.pause();
        audioRef.current?.pause();
      }
      recorder.stop();
      await recordingStopped;
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error('The full video export produced an empty file.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lesson.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'jimskay-lesson'}${hasAllVeoClips ? '' : '-animated'}.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      reset();
    } catch (e) {
      if (recorder?.state === 'recording') recorder.stop();
      setError(e instanceof Error ? e.message : 'Video export failed.');
    }
    finally {
      stream?.getTracks().forEach((track) => track.stop());
      setExporting(false);
    }
  };

  const current = locate(position);
  const currentVideoClip = videoClips.find((clip) => clip.sceneIndex === current.index);
  const percent = duration ? (position / duration) * 100 : 0;
  const runtimeIssues = useMemo(() => validateLessonRuntime(lesson), [lesson]);
  const currentScene = sceneRuntime(lesson.scenes[current.index]);
  const currentCheckpoint = currentScene.checkpoint;
  const addBookmark = () => {
    setBookmarks((items) => items.includes(Math.round(position)) ? items.filter((v) => v !== Math.round(position)) : [...items, Math.round(position)].sort((a, b) => a - b));
  };
  const saveNote = () => {
    if (!note.trim()) return;
    try {
      const key = `visual-lesson-note:${lesson.title}`;
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push({ time: Math.round(position), text: note.trim(), createdAt: Date.now() });
      localStorage.setItem(key, JSON.stringify(existing));
      setNote('');
    } catch {}
  };

  return (
    <div className="mx-auto my-5 w-full max-w-[640px] overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-2xl">
      <div className="border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0"><div className="text-sm font-bold text-white truncate">{lesson.title}</div><div className="text-[10px] uppercase tracking-[0.2em] text-white/35">Narrated visual lesson · scene {current.index + 1}/{lesson.scenes.length}</div></div>
        <div className="flex items-center gap-1.5"><Button size="icon" variant="ghost" onClick={() => setMuted(v => !v)} title={muted ? 'Unmute narration' : 'Mute narration'}>{muted ? <VolumeX className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}</Button></div>
      </div>
      {videoClips.length > 0 && (
        <section className="border-b border-white/10 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white">AI-generated video scenes</h3>
              <p className="mt-1 text-xs text-white/45">Each clip is cinematic B-roll. The narration is the master clock, while the semantic lesson layer supplies the exact teaching animation, emphasis, captions, and timing; narrated exports are rendered by the browser.</p>
            </div>
            {videoClips.length < lesson.scenes.length && (
              <span className="text-xs text-amber-200/80">Some scenes did not generate.</span>
            )}
          </div>
          <div className="grid gap-4">
            {videoClips.map((clip) => {
              const scene = lesson.scenes[clip.sceneIndex];
              if (!scene) return null;
              return (
                <article key={`${clip.sceneIndex}-${clip.filename}`} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                  <video
                    ref={(element) => {
                      if (element) veoVideosRef.current.set(clip.sceneIndex, element);
                      else veoVideosRef.current.delete(clip.sceneIndex);
                    }}
                    src={clip.downloadUrl}
                    controls
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="block aspect-video h-auto min-h-[320px] w-full bg-black object-cover object-center"
                    aria-label={`AI-generated video: ${scene.title}`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white">{scene.title}</div>
                      <p className="mt-1 text-xs leading-relaxed text-white/50">{scene.narration}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={() => void playVeoSceneWithNarration(clip.sceneIndex)} disabled={voiceLoading || exporting || exportingScene !== null}>
                        {voiceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Play with narration
                      </Button>
                      <Button type="button" size="sm" variant="secondary" onClick={() => void exportNarratedVeoScene(clip.sceneIndex)} disabled={voiceLoading || exporting || exportingScene !== null}>
                        {exportingScene === clip.sceneIndex ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Narrated MP4
                      </Button>
                      <a
                        href={`${clip.downloadUrl}?download=1`}
                        download={clip.filename}
                        className="inline-flex h-9 items-center rounded-md border border-white/10 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/10"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        MP4
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {showChapters && (
        <section className="border-b border-white/10 bg-white/[0.015] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Lesson chapters</span>
            <button type="button" onClick={() => setShowChapters(false)} className="text-[10px] text-white/35 hover:text-white/70">Hide</button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {lesson.scenes.map((scene, index) => {
              const start = sceneDurations.slice(0, index).reduce((a, b) => a + b, 0);
              const active = index === current.index;
              return (
                <button key={index} type="button" onClick={() => seek(start)}
                  className={`min-w-[170px] rounded-xl border px-3 py-2 text-left transition ${active ? 'border-primary/50 bg-primary/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Scene {String(index + 1).padStart(2, '0')}</div>
                  <div className="mt-1 truncate text-xs font-semibold text-white">{scene.title}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className="relative aspect-video overflow-hidden bg-[#090a10]">
        <canvas
          ref={canvasRef}
          className={`h-full w-full${currentVideoClip ? ' hidden' : ''}`}
          aria-label={lesson.title}
        />
        {currentVideoClip ? (
          <video
            key={currentVideoClip.downloadUrl}
            src={currentVideoClip.downloadUrl}
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            className="absolute inset-0 h-full w-full object-cover"
            aria-label={`AI-generated video: ${lesson.scenes[current.index]?.title || lesson.title}`}
          />
        ) : null}
      </div>
      <canvas ref={exportCanvasRef} className="hidden" aria-hidden="true" />
      {currentCheckpoint?.question && (
        <section className="border-t border-white/10 bg-white/[0.025] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary/80">Knowledge check</div>
          <p className="mt-2 text-sm font-semibold text-white">{currentCheckpoint.question}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(currentCheckpoint.options || []).map((option, index) => (
              <button key={index} type="button" onClick={() => setCheckpointAnswer(index)}
                className={`rounded-xl border px-3 py-2 text-left text-xs transition ${checkpointAnswer === index ? 'border-primary/50 bg-primary/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]'}`}>
                {String.fromCharCode(65 + index)}. {option}
              </button>
            ))}
          </div>
          {checkpointAnswer !== null && currentCheckpoint.answer !== undefined && (
            <p className="mt-3 text-xs text-white/60">
              {String(currentCheckpoint.answer) === String(checkpointAnswer) || String(currentCheckpoint.answer) === String.fromCharCode(65 + checkpointAnswer)
                ? 'Correct.'
                : `Review this step: ${currentCheckpoint.explanation || 'Use the highlighted visual and narration to work through it again.'}`}
            </p>
          )}
        </section>
      )}
      <div className="p-4 space-y-3">
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full bg-primary transition-[width]" style={{width:`${percent}%`}} /></div>
        <input aria-label="Lesson timeline" type="range" min="0" max={duration} step="50" value={position} onChange={e => seek(Number(e.target.value))} className="w-full accent-primary" />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={playing ? pause : play} disabled={voiceLoading} className="rounded-xl">{voiceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : playing ? <Pause className="mr-2 h-4 w-4"/> : <Play className="mr-2 h-4 w-4"/>}{voiceLoading ? 'Preparing narration…' : playing ? 'Pause' : 'Play'}</Button>
          <Button variant="secondary" onClick={reset} className="rounded-xl"><RotateCcw className="mr-2 h-4 w-4"/>Reset</Button>
          <select value={speed} onChange={e => { const nextSpeed=Number(e.target.value); pausedAtRef.current=position; startedAtRef.current=performance.now(); setSpeed(nextSpeed); if(audioRef.current) audioRef.current.playbackRate=nextSpeed; }} className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white"><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
          <Button variant="secondary" onClick={() => { void generateVoice().catch(() => {}); }} disabled={voiceLoading || exporting || playing} className="rounded-xl">{voiceLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Volume2 className="mr-2 h-4 w-4"/>}{audioUrls.length ? 'Regenerate voice' : 'Generate voice'}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => { void exportVideo(); }}
            disabled={exporting}
            title={exporting ? 'The narrated video is currently being rendered.' : 'Create and download the complete narrated lesson.'}
            aria-busy={exporting}
            className="rounded-xl ml-auto disabled:cursor-wait"
          >
            {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}
            {exporting ? 'Rendering full video…' : videoClips.length === lesson.scenes.length ? 'Download full narrated video' : 'Download narrated lesson'}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-3">
          <Button variant="secondary" size="sm" onClick={addBookmark}>
            {bookmarks.includes(Math.round(position)) ? '★ Bookmarked' : '☆ Bookmark'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowTranscript(v => !v)}>
            {showTranscript ? 'Hide transcript' : 'Transcript'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setReducedMotion(v => !v)}>
            {reducedMotion ? 'Motion off' : 'Reduced motion'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDebugMode(v => !v)}>
            {debugMode ? 'Hide debug' : 'Debug'}
          </Button>
          <select value={lessonMode} onChange={e => setLessonMode(e.target.value as typeof lessonMode)}
            className="h-9 rounded-lg border border-white/10 bg-white/5 px-2 text-xs text-white">
            <option value="cinematic">Cinematic</option>
            <option value="whiteboard">Whiteboard</option>
            <option value="presentation">Presentation</option>
            <option value="diagram">Diagram</option>
          </select>
        </div>
        <div className="flex gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note at this moment…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white outline-none placeholder:text-white/30" />
          <Button variant="secondary" size="sm" onClick={saveNote} disabled={!note.trim()}>Save note</Button>
        </div>
        {showTranscript && (
          <div className="max-h-52 overflow-auto rounded-xl border border-white/10 bg-white/[0.025] p-3">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Transcript</div>
            {lesson.scenes.map((scene, index) => {
              const start = sceneDurations.slice(0, index).reduce((a, b) => a + b, 0);
              return <button key={index} type="button" onClick={() => seek(start)} className="block w-full border-b border-white/5 py-2 text-left text-xs text-white/65 hover:text-white">
                <span className="mr-2 text-primary/70">{formatTime(start)}</span>{scene.narration}
              </button>;
            })}
          </div>
        )}
        {debugMode && (
          <div className="rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 font-mono text-[10px] text-amber-100/70">
            <div>Renderer {RENDER_VERSION}</div>
            <div>Scene {current.index + 1} · {Math.round(current.local)}ms / {Math.round(sceneDurations[current.index])}ms</div>
            <div>Elements {lesson.scenes[current.index]?.elements?.length || 0} · FPS target 60 · DPR capped at 2</div>
            <div>Runtime validation {runtimeIssues.length ? `${runtimeIssues.length} issue(s)` : 'passed'}</div>
            {runtimeIssues.slice(0, 3).map((issue, i) => <div key={i}>• {issue}</div>)}
          </div>
        )}
        {error && <p className="text-xs text-red-300">{error}</p>}
        <p className="text-[11px] text-white/35">Narration is measured before playback and each scene stays on screen until its voice-over finishes.</p>
      </div>
    </div>
  );
}
