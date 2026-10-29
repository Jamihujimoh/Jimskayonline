export type NarrationUnit = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  wordCount: number;
};

/**
 * Builds deterministic timing anchors from the narration text and the actual
 * duration of the generated TTS file. The audio duration is authoritative;
 * text is only used to distribute visual beats/captions inside that duration.
 */
export function splitNarrationUnits(text: string): string[] {
  return text
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((part) => part.trim())
    .filter(Boolean) || (text.trim() ? [text.trim()] : []);
}

export function buildNarrationTimeline(text: string, durationMs: number, maxUnits = 32): NarrationUnit[] {
  const units = splitNarrationUnits(text).slice(0, maxUnits);
  if (!units.length || durationMs <= 0) return [];

  const weights = units.map((unit) => Math.max(1, unit.split(/\s+/).filter(Boolean).length));
  const total = weights.reduce((sum, value) => sum + value, 0) || 1;
  let cursor = 0;

  return units.map((unit, index) => {
    const startMs = cursor;
    const endMs = index === units.length - 1
      ? durationMs
      : Math.min(durationMs, cursor + durationMs * (weights[index] / total));
    cursor = endMs;
    return {
      id: `narration-${index + 1}`,
      text: unit,
      startMs,
      endMs,
      wordCount: weights[index],
    };
  });
}

export function scaleTimelineMs(value: number, authoredDurationMs: number, runtimeDurationMs: number): number {
  if (!Number.isFinite(value) || authoredDurationMs <= 0 || runtimeDurationMs <= 0) return Math.max(0, value || 0);
  return Math.max(0, Math.min(runtimeDurationMs, value * (runtimeDurationMs / authoredDurationMs)));
}

export function scaleRange(
  startMs: number,
  endMs: number,
  authoredDurationMs: number,
  runtimeDurationMs: number,
) {
  const start = scaleTimelineMs(startMs, authoredDurationMs, runtimeDurationMs);
  const end = Math.max(start, scaleTimelineMs(endMs, authoredDurationMs, runtimeDurationMs));
  return { startMs: start, endMs: end };
}
