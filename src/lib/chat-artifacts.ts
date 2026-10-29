export type ChatArtifactKind = 'html' | 'svg';

export type ChatArtifact = {
  kind: ChatArtifactKind;
  title?: string;
  code: string;
};

export const MAX_ARTIFACT_SIZE = 120_000;

function stripDangerousDocumentFeatures(code: string): string {
  // The preview iframe already uses a restrictive CSP. These replacements add a
  // second safety boundary and prevent an AI artifact from trying to navigate the
  // parent page or submit forms outside its sandbox.
  return code
    .replace(/<form\b[^>]*>/gi, '<div>')
    .replace(/<\/form>/gi, '</div>')
    .replace(/\btarget\s*=\s*["']_top["']/gi, '')
    .replace(/\btarget\s*=\s*["']_parent["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/window\.parent/gi, 'window');
}

export function extractChatArtifact(text: string): { text: string; artifact?: ChatArtifact } {
  const match = text.match(/```(html|svg)\s*\n([\s\S]*?)\n```/i);
  if (!match) return { text };

  const rawCode = match[2].trim();
  if (!rawCode || rawCode.length > MAX_ARTIFACT_SIZE) return { text };

  const kind = match[1].toLowerCase() as ChatArtifactKind;
  const code = stripDangerousDocumentFeatures(rawCode);
  const marker = '[VISUAL_ARTIFACT_PLACEHOLDER]';
  const startIndex = match.index ?? 0;
  const before = text.slice(0, startIndex).replace(/\n{3,}/g, '\n\n').trim();
  const after = text.slice(startIndex + match[0].length).replace(/\n{3,}/g, '\n\n').trim();
  const preservedText = [before, marker, after].filter(Boolean).join('\n\n');

  return { text: preservedText, artifact: { kind, code } };
}

export function hasUnrequestedGameUi(artifact: ChatArtifact): boolean {
  if (artifact.kind !== 'html') return false;
  return /\b(?:start\s+game|reset\s+game|serve\s+ball|scoreboard|player\s*1\s*:\s*0|player\s*2\s*:\s*0|ball\s+spin|launch\s+angle|gravity|drag\s+coefficient|type=["']range["'])\b/i.test(artifact.code);
}

export function hasMeaningfulVisualContent(artifact: ChatArtifact): boolean {
  const code = artifact.code;
  const svgContent = /<(?:svg|path|circle|rect|ellipse|line|polyline|polygon|g|text|use|defs)\b/i.test(code);
  const canvasContent = /(?:getContext\s*\(|fillRect\s*\(|strokeRect\s*\(|arc\s*\(|moveTo\s*\(|lineTo\s*\(|bezierCurveTo\s*\(|quadraticCurveTo\s*\()/.test(code);
  const htmlContent = /<(?:div|canvas|svg|section|figure|table|ul|ol)\b/i.test(code);
  return svgContent || canvasContent || htmlContent;
}

export function hasResponsiveVisualStructure(artifact: ChatArtifact): boolean {
  const code = artifact.code;
  if (artifact.kind === 'svg') return /viewBox\s*=\s*["'][^"']+["']/i.test(code);
  return /(?:max-width\s*:\s*100%|width\s*:\s*min\(|width\s*:\s*clamp\(|@media\b|viewport)/i.test(code);
}

export function lacksAutoplayAnimation(artifact: ChatArtifact): boolean {
  if (artifact.kind !== 'html') return false;
  return !/(?:requestAnimationFrame|setInterval|setTimeout|animation\s*[:=]|@keyframes|<animate(?:Motion|Transform)?\b)/i.test(artifact.code);
}

export function matchesRequestedSubject(artifact: ChatArtifact | undefined, request: string): boolean {
  if (!artifact) return false;
  const code = artifact.code.toLowerCase();
  const requestText = request.toLowerCase();
  const requestedWords = requestText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3)
    .filter((word) => !['show','draw','create','make','with','from','into','that','this','just','then','your','their','using','about','visual','diagram','animation','simulation','demo','example','project'].includes(word));
  const subjectHints = requestedWords.length ? requestedWords : ['projectile'];
  const directMatch = subjectHints.some((word) => code.includes(word));
  const unrelatedFallback = /(car|truck|tennis|paddle|scoreboard|player\s*1|player\s*2|game\s+ui|start\s+button|reset\s+button|slider)/i.test(code);
  if (unrelatedFallback && !requestText.match(/\b(?:car|truck|tennis|paddle|game|scoreboard)\b/i)) return false;
  return directMatch || /(trajectory|projectile|velocity|acceleration|gravity|range|height|launch|angle|vector|orbit|axis|graph|circle|wave|force|motion|equation|coordinate)/i.test(code);
}
