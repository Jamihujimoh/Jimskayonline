export const CHAT_MODELS = [
  { id: 'googleai/gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash Lite' },
  { id: 'googleai/gemini-3.5-flash', name: 'Gemini 3.5 Flash' },
  { id: 'googleai/gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite' },
  { id: 'googleai/gemini-3.6-flash', name: 'Gemini 3.6 Flash' },
  { id: 'googleai/gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
] as const;

export type ChatModelId = (typeof CHAT_MODELS)[number]['id'];

export const DEFAULT_CHAT_MODEL: ChatModelId = CHAT_MODELS[0].id;

export function isChatModelId(value: string | undefined): value is ChatModelId {
  return CHAT_MODELS.some((model) => model.id === value);
}