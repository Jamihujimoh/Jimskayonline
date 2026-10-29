export const FORGE_LANGUAGES = ['python', 'javascript', 'typescript', 'bash', 'html', 'css'] as const;

export type ForgeLanguage = (typeof FORGE_LANGUAGES)[number];

export interface ForgeSnippet {
  id: string;
  title: string;
  language: ForgeLanguage | string;
  code: string;
  createdAt?: { toDate: () => Date } | null;
}

export function isForgeSnippet(value: unknown): value is ForgeSnippet {
  if (!value || typeof value !== 'object') return false;
  const snippet = value as Partial<ForgeSnippet>;
  return typeof snippet.id === 'string' && typeof snippet.title === 'string' && typeof snippet.code === 'string' && typeof snippet.language === 'string';
}

export function normalizeForgeLanguage(value: string): ForgeLanguage {
  return FORGE_LANGUAGES.includes(value as ForgeLanguage) ? value as ForgeLanguage : 'python';
}
