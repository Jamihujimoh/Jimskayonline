import type { ChatArtifact } from '@/lib/chat-artifacts';

export type VisualArtifactQuality = {
  errors: string[];
  warnings: string[];
  score: number;
  checks: Record<string, boolean>;
};

/** Deterministic second-stage quality gate for AI-created visuals. */
export function validateVisualArtifactQuality(artifact: ChatArtifact, request = ''): VisualArtifactQuality {
  const code = artifact.code;
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, boolean> = {};

  checks.nonEmpty = code.trim().length > 80;
  checks.hasVisualRoot = artifact.kind === 'svg' ? /<svg\b/i.test(code) : /<(?:canvas|svg|main|section|figure|div)\b/i.test(code);
  checks.responsive = artifact.kind === 'svg' ? /viewBox\s*=\s*["'][^"']+["']/i.test(code) : /(?:max-width|width\s*:\s*(?:min|clamp)|@media|viewport)/i.test(code);
  checks.noParentNavigation = !/(?:window\.(?:parent|top)|parent\.location|top\.location)/i.test(code);
  checks.noInlineJavascriptUrl = !/javascript:/i.test(code);
  checks.noExternalDocumentEmbedding = !/<iframe\b/i.test(code);
  checks.hasLabels = artifact.kind === 'svg' ? /<text\b/i.test(code) || !/<(?:circle|rect|path|line)\b/i.test(code) : /(?:aria-label|<label\b|<text\b|data-label|title\b)/i.test(code);

  if (!checks.nonEmpty) errors.push('Artifact is empty or too small to be meaningful.');
  if (!checks.hasVisualRoot) errors.push('Artifact has no recognizable visual root.');
  if (!checks.responsive) warnings.push('Artifact does not clearly declare responsive sizing.');
  if (!checks.noParentNavigation) errors.push('Artifact attempts to navigate the parent page.');
  if (!checks.noInlineJavascriptUrl) errors.push('Artifact contains a javascript: URL.');
  if (!checks.noExternalDocumentEmbedding) errors.push('Artifact contains an iframe, which is not allowed in the standalone visual artifact contract.');
  if (!checks.hasLabels) warnings.push('Artifact may lack readable labels or semantic annotations.');

  const requestedWords = request.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5).slice(0, 20);
  if (requestedWords.length && !requestedWords.some((word) => code.toLowerCase().includes(word))) {
    warnings.push('The generated visual has weak textual evidence that it matches the latest request; subject validation should run before display.');
  }

  const values = Object.values(checks);
  const score = Math.max(0, Math.min(100, Math.round(values.filter(Boolean).length / values.length * 100) - errors.length * 12 - warnings.length * 3));
  return { errors, warnings, score, checks };
}
