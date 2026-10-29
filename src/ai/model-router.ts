/**
 * @fileOverview Jimskay Neural Model Router.
 * Central model laddering + key-matrix fallback for every Jimskay AI flow.
 *
 * Free-tier model routing keeps normal users on the lowest confirmed working
 * model and gives creators the highest confirmed working model first. Every
 * flow still runs through a ladder of models × keys and gracefully steps down
 * until a working combination is found.
 *
 * LADDERS: every listed rung passed a live generateContent probe with the
 * configured Google API key. gemini-2.5-flash-lite returned 404 and is omitted.
 *  - ask (standard):   2.5-flash -> 3.1-flash-lite -> 3.5-flash-lite -> 3.5-flash -> 3.6-flash
 *  - ask (creator):    3.6-flash -> 3.5-flash -> 3.5-flash-lite -> 3.1-flash-lite -> 2.5-flash
 *  - admin:            creator ladder (free-tier only)
 *  - studio:           selected by creator status
 *
 * ERROR CLASSIFICATION:
 *  - 'model'      model unknown/unsupported (404, "not found")  → dead-list model, step down ladder.
 *  - 'restricted' model is paid-only on this key ("limit: 0" / free_tier) → try every key; if all
 *                 reject it, step down ladder (a paid key in the matrix still gets its shot).
 *  - 'busy'       model-wide transient overload (503 "high demand") → rotate through the
 *                 configured key matrix before stepping down to the next model.
 *  - 'key'        quota / rate-limit / auth (429, 403, 401, quota, denied, RESOURCE_EXHAUSTED, ...)
 *                 → rotate key; if all keys fail, step down the ladder.
 *  - 'fatal'      anything else (context too long, internal errors) → rethrow immediately.
 */

import { keyManager } from './key-manager';

export const MODEL_IDS = {
  flash38: 'googleai/gemini-3.8-flash',
  flash37: 'googleai/gemini-3.7-flash',
  flash35: 'googleai/gemini-3.5-flash',
  flash36: 'googleai/gemini-3.6-flash',
  flashLite35: 'googleai/gemini-3.5-flash-lite',
  flashLite31: 'googleai/gemini-3.1-flash-lite',
  flash25: 'googleai/gemini-2.5-flash',
} as const;

export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

/** Maximum output tokens requested on every laddered generation. */
export const MAX_OUTPUT_TOKENS = 65536;

export type ModelMode = 'ask' | 'admin' | 'studio';

const ASK_LADDER: readonly ModelId[] = [
  MODEL_IDS.flash25,
  MODEL_IDS.flashLite31,
  MODEL_IDS.flashLite35,
  MODEL_IDS.flash35,
  MODEL_IDS.flash36,
];
const CREATOR_ASK_LADDER: readonly ModelId[] = [
  MODEL_IDS.flash36,
  MODEL_IDS.flash35,
  MODEL_IDS.flashLite35,
  MODEL_IDS.flashLite31,
  MODEL_IDS.flash25,
];
const ADMIN_LADDER: readonly ModelId[] = [
  ...CREATOR_ASK_LADDER,
];
const STUDIO_LADDER: readonly ModelId[] = [
  ...ASK_LADDER,
];

/** Full ladder table (exported for logging / future UI). */
export const MODEL_LADDERS: Record<ModelMode, readonly ModelId[]> = {
  ask: ASK_LADDER,
  admin: ADMIN_LADDER,
  studio: STUDIO_LADDER,
};

export function pickLadder(mode: ModelMode, isCreator = false): readonly string[] {
  if (mode === 'ask') return isCreator ? CREATOR_ASK_LADDER : ASK_LADDER;
  if (mode === 'studio') return isCreator ? CREATOR_ASK_LADDER : ASK_LADDER;
  return MODEL_LADDERS[mode];
}

export function pickInitialModel(mode: ModelMode, isCreator = false): string {
  return pickLadder(mode, isCreator)[0];
}

type ErrorKind = 'model' | 'restricted' | 'busy' | 'key' | 'fatal';

export function classifyModelError(error: unknown): { kind: ErrorKind; reason: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const reason = raw.slice(0, 400);
  const msg = raw.toLowerCase();

  // 1) Model itself does not exist / is not supported on this endpoint.
  if (
    msg.includes('404') ||
    msg.includes('not found') ||
    msg.includes('unsupported model') ||
    msg.includes('model not supported') ||
    msg.includes('does not exist') ||
    msg.includes('is not supported') ||
    msg.includes('not supported for this')
  ) {
    return { kind: 'model', reason };
  }

  // 1b) Model cannot run Genkit tool rounds (e.g. the 3.5-flash-lite family
  // rejects the function role with a 400). Dead-list it and step down so a PDF
  // /webSearch request never hard-fails on a rung that cannot call tools.
  if (
    msg.includes("role 'function'") ||
    msg.includes('role "function"') ||
    msg.includes("'function' is not supported") ||
    msg.includes('function calling is not supported') ||
    (msg.includes('valid role') && msg.includes('system'))
  ) {
    return { kind: 'model', reason };
  }

  // 1c) Model-wide transient overload ("high demand" 503). Keep it distinct for logging,
  //     but let the fallback loop give every configured key a chance before stepping down.
  if (msg.includes('high demand') || msg.includes('currently experiencing')) {
    return { kind: 'busy', reason };
  }

  // 2) Model is restricted for this key/plan (paid-only on free tier, "limit: 0").
  if (
    msg.includes('limit: 0') ||
    msg.includes('free_tier_requests') ||
    (msg.includes('free tier') && msg.includes('limit'))
  ) {
    return { kind: 'restricted', reason };
  }

  // 3) Key-level or transient failures — rotate the key / step down the ladder.
  if (
    msg.includes('429') ||
    msg.includes('403') ||
    msg.includes('401') ||
    msg.includes('quota') ||
    msg.includes('denied') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('forbidden') ||
    msg.includes('api key') ||
    msg.includes('invalid key') ||
    msg.includes('503') ||
    msg.includes('high demand') ||
    msg.includes('temporarily') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('deadline') ||
    msg.includes('timed out')
  ) {
    return { kind: 'key', reason };
  }

  return { kind: 'fatal', reason };
}

/** Models confirmed dead for every key this process will ever see (e.g. 404). */
const DEAD_MODELS = new Set<string>();

/**
 * Models that every key in the matrix rejected as paid-only/restricted (free-tier
 * "limit: 0" on all 20+ keys). Cached for the process lifetime so subsequent
 * requests don't burn a 20-key × backoff cycle rediscovering the same wall.
 */
const RESTRICTED_MODELS = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ModelFallbackOptions<T> {
  mode?: ModelMode;
  isCreator?: boolean;
  /** Explicit override; takes precedence over mode/isCreator. */
  ladder?: readonly string[];
  /** Max attempts (keys) per model before stepping down. Defaults to key count. */
  attemptsPerModel?: number;
  run: (model: string) => Promise<T>;
}

/**
 * Runs `run(model)` across the chosen ladder, rotating through every API key in
 * the matrix on each rung. Returns the first successful result. Only rethrows
 * when the error is truly fatal or the whole ladder × key matrix is exhausted.
 */
export async function withModelFallback<T>(options: ModelFallbackOptions<T>): Promise<T> {
  const ladder = options.ladder
    ? [...options.ladder]
    : [...pickLadder(options.mode ?? 'ask', options.isCreator ?? false)];
  const keyCount = Math.max(keyManager.getKeyCount(), 1);
  const attemptsPerModel = Math.max(options.attemptsPerModel ?? keyCount, 1);
  let lastError: unknown = null;
  let stepDownDelay = 250;

  for (const model of ladder) {
    if (DEAD_MODELS.has(model) || RESTRICTED_MODELS.has(model)) continue;

    // Tracks whether every failure on this rung was a deterministic "paid-only on
    // this key" rejection. If so, the whole matrix will reject it — cache that.
    let allRestricted = true;
    let attemptsUsed = 0;

    for (let attempt = 0; attempt < attemptsPerModel; attempt++) {
      try {
        return (await options.run(model)) as T;
      } catch (error) {
        lastError = error;
        attemptsUsed++;
        const { kind, reason } = classifyModelError(error);

        if (kind === 'fatal') throw error;

        if (kind === 'model') {
          DEAD_MODELS.add(model);
          allRestricted = false;
          console.warn(`[MODEL-ROUTER] ${model} unusable for this request — dead-listing and stepping down.`);
          break; // stop burning keys on a model that can never exist
        }

        if (kind === 'busy') {
          // Still rotate keys for overloads. Providers can apply throttling per key,
          // and the caller explicitly expects the full configured matrix per model.
          allRestricted = false;
          console.warn(
            `[MODEL-ROUTER] ${model} is busy (high demand) — trying key ${attempt + 1}/${attemptsPerModel}.`
          );
          keyManager.rotateKey();
          if (attempt < attemptsPerModel - 1) {
            await sleep(stepDownDelay);
            stepDownDelay = Math.min(stepDownDelay + 150, 1200);
          }
          continue;
        }

        if (kind === 'key') allRestricted = false;

        // 'key' or 'restricted': give the next key a shot at this model first.
        console.warn(
          `[MODEL-ROUTER] ${model} attempt ${attempt + 1}/${attemptsPerModel} failed (${kind}). ${reason}`
        );
        keyManager.rotateKey();
        // Back off only between rate-limit (key) failures. Restricted rejections
        // are deterministic per key — sleeping 20× would stall every request.
        if (kind === 'key' && attempt < attemptsPerModel - 1) {
          await sleep(stepDownDelay);
          stepDownDelay = Math.min(stepDownDelay + 150, 1200);
        }
      }
    }

    if (allRestricted) {
      RESTRICTED_MODELS.add(model);
      console.warn(
        `[MODEL-ROUTER] ${model} is paid-only/restricted on every key — cached as restricted for this process.`
      );
    }

    // Every key failed on this model — step down to the next rung.
    console.warn(`[MODEL-ROUTER] ${model} exhausted after ${attemptsUsed} of ${attemptsPerModel} key attempt(s). Stepping down.`);
    await sleep(400);
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  throw new Error(
    `Neural Key Matrix completely exhausted. Every free model node and API key is at its limit or unavailable. ` +
      `Add more free API keys or wait for the quota window to reset. Last error: ${detail.slice(0, 300)}`
  );
}

/* -------------------------------------------------------------------------- */
/*  Truncation / continuation helpers                                         */
/* -------------------------------------------------------------------------- */

/** Characters that normally terminate a finished utterance or code block. */
const ENDING_PUNCTUATION = new Set([
  '.', '!', '?', '。', '！', '？', '”', '“', '"', '’', '…', '`', '~', '】', '」', '』', '）', ')', ']', '}', '>',
]);

/**
 * Heuristic: did the model stop because it ran out of room or got cut mid-thought?
 * Strong signals: finishReason === 'length', an unterminated markdown code fence,
 * or a long body that stops abruptly without closing punctuation.
 */
export function looksIncomplete(text: string, finishReason?: string | null): boolean {
  if (finishReason === 'length') return true;

  const trimmed = (text ?? '').trimEnd();
  if (trimmed.length < 300) return false; // short replies are simply short

  // Odd number of ``` markers means an open code block got chopped off.
  const fences = trimmed.match(/```/g);
  if (fences && fences.length % 2 === 1) return true;

  const lastChar = trimmed[trimmed.length - 1];
  return !ENDING_PUNCTUATION.has(lastChar);
}

/**
 * Signature-shaped on a Genkit generate response so flows can pass the object
 * they already hold without extra imports. `text` overrides `response.text`.
 */
export interface GeneratedLike {
  finishReason?: string | null;
  text?: string;
}

/** Convenience wrapper: true when a generation should be continued with another round. */
export function wasCutOff(response: GeneratedLike | null | undefined, text?: string): boolean {
  return looksIncomplete(text ?? response?.text ?? '', response?.finishReason);
}

/**
 * Builds the user-side continuation message that asks the model to keep writing
 * from the exact spot it stopped, rather than restating what already exists.
 */
export function continuationPrompt(): string {
  return (
    '[SYSTEM: Your previous reply was cut off before you finished. Do NOT repeat anything you ' +
    'already wrote. Start by completing the very next sentence/code line from the exact point where ' +
    'your last message ended, then continue the rest of the work until it is genuinely complete. ' +
    'Do not ask for permission — just finish the task.]'
  );
}

/**
 * Slices the *final* marker paragraph that admin agents append on completion
 * (e.g. "✅ TASK COMPLETE…") off a resumed stream so partial runs don't look done.
 */
export function stripDoneMarkers(text: string): string {
  return text
    .replace(/^\s*(?:DONE|COMPLETE|FINISHED|TASK COMPLETE|ALL STEPS? COMPLETE)[^\n]*$/gim, '')
    .trimEnd();
}

/* -------------------------------------------------------------------------- */
/*  Multi-round auto-continue                                                  */
/* -------------------------------------------------------------------------- */

/** Maximum extra generation rounds allowed after a truncated first pass. */
export const MAX_CONTINUATIONS = 4;

/**
 * Hard character ceiling for an assembled multi-round answer. A single 65536-token
 * response is already huge; this only guards against pathological echo loops where
 * a model repeats itself across rounds instead of continuing.
 */
export const MAX_CONTINUATION_CHARS = 750_000;

/** Result of one generation round inside an auto-continue loop. */
export interface RoundRunResult<T = undefined> {
  /** Text emitted *this round*. Continuation rounds must append fresh text only. */
  text: string;
  /** Genkit finishReason for the round (drives cut-off detection). */
  finishReason?: string | null;
  /** Optional structured payload captured this round (flows map it to their own shape). */
  payload?: T;
  /** Force another round even when the text looks finished (structured-output flows). */
  forceContinue?: boolean;
}

export interface AutoContinueOptions<T = undefined> {
  mode?: ModelMode;
  isCreator?: boolean;
  ladder?: readonly string[];
  attemptsPerModel?: number;
  /** Extra rounds permitted beyond the first. Defaults to MAX_CONTINUATIONS. */
  maxContinuations?: number;
  /** Hard ceiling for the combined text. Defaults to MAX_CONTINUATION_CHARS. */
  maxChars?: number;
  /**
   * True → rotate to the next API key before each continuation round so the key
   * that already spent its output budget gets a rest. Defaults to true (no-op
   * when the matrix holds a single key).
   */
  rotateBetweenRounds?: boolean;
  /** Which round's payload survives: 'first' (stable artifacts) or 'last'. Defaults to 'last'. */
  keepPayload?: 'first' | 'last';
  run: (
    model: string,
    ctx: { round: number; isContinuation: boolean; previousText: string }
  ) => Promise<RoundRunResult<T>>;
}

export interface AutoContinueResult<T = undefined> {
  /** Full assembled answer across every round. */
  text: string;
  /** Kept payload (policy governed by keepPayload). */
  payload: T | undefined;
  /** Number of generation rounds actually executed (>= 1). */
  rounds: number;
  /** True when the loop stopped because it ran out of rounds/chars, not because it finished. */
  truncated: boolean;
}

const MATRIX_EXHAUSTED_MARKER = 'Neural Key Matrix completely exhausted';

/** Drops any leading portion of `incoming` that duplicates the tail of `combined`. */
function trimLeadingOverlap(combined: string, incoming: string): string {
  if (!combined || !incoming) return incoming;
  if (incoming === combined) return '';
  if (incoming.startsWith(combined)) return incoming.slice(combined.length);
  const maxOverlap = Math.min(combined.length, incoming.length, 2000);
  for (let n = maxOverlap; n >= 20; n--) {
    if (combined.endsWith(incoming.slice(0, n))) return incoming.slice(n);
  }
  return incoming;
}

/**
 * Runs `options.run` through the model ladder, then automatically issues follow-up
 * rounds whenever a response was cut off at its output limit (finishReason 'length'
 * or an abrupt mid-sentence stop), so the model keeps writing until the task is
 * genuinely done — never pausing to ask "shall I continue?".
 *
 * The callback receives the full text produced so far (`previousText`) so flows can
 * rebuild their context (history + continuation prompt) for the next round. Each
 * round runs its own ladder/key fallback, and the key is rotated between rounds.
 */
export async function withAutoContinue<T = undefined>(
  options: AutoContinueOptions<T>
): Promise<AutoContinueResult<T>> {
  const maxRounds = 1 + Math.max(options.maxContinuations ?? MAX_CONTINUATIONS, 0);
  const maxChars = options.maxChars ?? MAX_CONTINUATION_CHARS;
  const keepPayload = options.keepPayload ?? 'last';
  const rotateBetweenRounds = options.rotateBetweenRounds ?? true;

  let combined = '';
  let payload: T | undefined;
  let truncated = false;
  let stopped = false;
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    if (round > 0 && rotateBetweenRounds) keyManager.rotateKey();

    const result: RoundRunResult<T> = await (async () => {
      try {
        return await withModelFallback({
          mode: options.mode,
          isCreator: options.isCreator,
          ladder: options.ladder,
          attemptsPerModel: options.attemptsPerModel,
          run: (model) => options.run(model, { round, isContinuation: round > 0, previousText: combined }),
        });
      } catch (error) {
        // A failed continuation round must never destroy an answer we already have.
        if (round > 0) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes(MATRIX_EXHAUSTED_MARKER)) {
            console.warn(
              `[MODEL-ROUTER] continuation round ${round + 1}/${maxRounds} skipped — key matrix exhausted; returning the ${combined.length} chars already generated.`
            );
            truncated = true;
            stopped = true;
            return { text: '', finishReason: null, forceContinue: false };
          }
        }
        throw error;
      }
    })();

    const roundText = (result.text ?? '').trim();
    const incoming = round === 0 ? roundText : trimLeadingOverlap(combined, roundText);
    if (round === 0) {
      combined = incoming;
    } else if (incoming) {
      combined = (combined ? combined.replace(/\s+$/, '') + ' ' : '') + incoming;
    }

    if (round === 0 || keepPayload === 'last') {
      if (result.payload !== undefined) payload = result.payload;
    }
    rounds++;

    if (combined.length >= maxChars) {
      truncated = true;
      break;
    }

    const wantsMore =
      result.forceContinue === true || wasCutOff({ finishReason: result.finishReason, text: combined }, combined);
    if (!wantsMore || stopped) break;
  }

  return { text: combined.trimEnd(), payload, rounds, truncated };
}
