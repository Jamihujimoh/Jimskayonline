import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit';
import { classifyModelError } from './model-router';
import { keyManager } from './key-manager';

type GoogleGenkit = ReturnType<typeof genkit>;

const instances = new Map<string, GoogleGenkit>();

function clientForKey(apiKey: string): GoogleGenkit {
  let client = instances.get(apiKey);
  if (!client) {
    client = genkit({ plugins: [googleAI({ apiKey })] });
    instances.set(apiKey, client);
  }
  return client;
}

export async function withGoogleApiKeyFallback<T>(
  operationName: string,
  run: (client: GoogleGenkit, apiKey: string) => Promise<T>
): Promise<T> {
  const keys = keyManager.getKeysFromCurrent();
  if (keys.length === 0) {
    throw new Error('No Google AI API keys are configured. Add keys to GEMINI_KEYS before generating media.');
  }

  let lastError: unknown;
  for (let index = 0; index < keys.length; index++) {
    const apiKey = keys[index];
    try {
      return await run(clientForKey(apiKey), apiKey);
    } catch (error) {
      lastError = error;
      const { kind, reason } = classifyModelError(error);
      if (kind === 'fatal' || kind === 'model') throw error;
      console.warn(
        `[${operationName}] API key ${index + 1}/${keys.length} failed (${kind}); trying the next configured key. ${reason}`
      );
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  throw new Error(
    `${operationName} failed with all ${keys.length} configured Google AI API key(s). ` +
    `Check key access and quota. Last error: ${detail.slice(0, 300)}`
  );
}
