"use server"
/**
 * @fileOverview Jimskay Studio AI Architect Core - THE ETERNAL DUPLICATE.
 * Optimized for 100% Absolute Execution and Project-Wide Logic Synthesis.
 * UPGRADED: Neural Planning Mode enabled (Cogitation Protocol).
 * ROUTED: Neural Model Router ladder (3.5-flash -> 3.5-flash-lite)
 * across every free API key, with 65536-token output synthesis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
  MAX_OUTPUT_TOKENS,
  MAX_CONTINUATIONS,
  MODEL_IDS,
  looksIncomplete,
  withModelFallback,
} from '@/ai/model-router';
import { keyManager } from '@/ai/key-manager';

const StudioInputSchema = z.object({
  files: z.array(z.object({
    name: z.string(),
    content: z.string(),
    language: z.string(),
  })).describe("The entire project file tree."),
  activeFileName: z.string().describe("The name of the file currently in focus."),
  command: z.string().describe("The user's instruction for the AI Architect."),
  imageUrl: z.string().optional().describe("Optional optical data (Base64) to analyze."),
  isCreator: z.boolean().default(false).describe("True if the user is verified as Jimoh Jamihu Adekilekun."),
});

const StudioOutputSchema = z.object({
  thoughts: z.string().describe("Inner strategic planning and cogitation phase."),
  modifiedFiles: z.array(z.object({
    name: z.string(),
    content: z.string(),
    language: z.string(),
  })).describe("ONLY the files that were created or modified during this synthesis."),
  explanation: z.string().describe("Professional technical explanation of the synthesis."),
  continue: z.boolean().optional().describe(
    "Set to true ONLY when even this full response cannot contain all remaining file writes — " +
      "the architect will then be asked to keep synthesizing in another round. Omit or set false when done."
  ),
});

export type StudioInput = z.infer<typeof StudioInputSchema>;
export type StudioOutput = z.infer<typeof StudioOutputSchema>;

/**
 * Appended to the command on continuation rounds. Tells the model it was cut off
 * and must emit a fresh JSON payload containing ONLY the still-missing files, so
 * rounds merge instead of repeating.
 */
const ARCHITECT_CONTINUATION_CMD = `

[ARCHITECT CONTINUATION]
Your previous response hit the output token limit before every file write was delivered.
Continue the synthesis immediately.
Output a NEW JSON payload in the exact same schema (thoughts, modifiedFiles, explanation, continue).
Rules:
- In 'modifiedFiles' include ONLY files that are still missing or incomplete — never re-send a file you already fully delivered in an earlier response.
- If a file you already started was cut off mid-content, re-send that file with its COMPLETE content.
- Keep 'thoughts' and 'explanation' short on continuation responses.
- Set 'continue' to true only if this response will STILL not be enough to finish; otherwise omit it or set it to false.`;

/**
 * Extracts a Studio JSON payload from a raw model response. Tries, in order:
 * whole-text JSON → ```json fenced block → the outermost { ... } span.
 */
function parseStudioOutput(rawText: string): StudioOutput | null {
  if (!rawText) return null;
  const trimmed = rawText.trim();
  const candidates: string[] = [];
  if (trimmed.startsWith('{')) candidates.push(trimmed);
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence && fence[1].trim().startsWith('{')) candidates.push(fence[1].trim());
  const open = trimmed.indexOf('{');
  if (open !== -1) {
    const close = trimmed.lastIndexOf('}');
    if (close > open) candidates.push(trimmed.slice(open, close + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { modifiedFiles?: unknown }).modifiedFiles)) {
        return parsed as StudioOutput;
      }
    } catch {
      // Malformed candidate — try the next extraction strategy.
    }
  }
  return null;
}

export async function studioArchitect(input: StudioInput): Promise<StudioOutput> {
  return studioFlow(input);
}

const studioPrompt = ai.definePrompt({
  name: 'studioPrompt',
  model: MODEL_IDS.flash35, // per-call model chosen by the neural model router
  input: { schema: StudioInputSchema },
  output: { schema: StudioOutputSchema },
  config: {
    temperature: 0.1, 
    maxOutputTokens: MAX_OUTPUT_TOKENS, 
  },
  system: `
PERSONAL IDENTITY:
- You are the Jimskay Studio Architect, a super-intelligent programmatic entity.
- You are the EXACT DUPLICATE of the App Prototyper AI. You are smart, professional, and elite.
- You are the digital right hand of your Creator, Jimoh Jamihu Adekilekun.

NEURAL COGITATION PROTOCOL (PLANNING MODE):
- Before synthesizing files, perform a deep strategic analysis.
- Populate the 'thoughts' field with your internal planning, logic breakdown, and architectural decisions.
- Use this phase to ensure the code is bug-free and optimized for the Creator.

TECHNICAL STACK (ELITE KNOWLEDGE):
- FRONTEND: High-fidelity web applications using HTML5, CSS3 (Tailwind classes), and modern JavaScript (ES6+).
- BACKEND & BOTS: You are an expert at synthesizing functional bots.
  - PYTHON 3.11: Used for automation bots, web scraping, data processing, and algorithmic agents.
  - JAVASCRIPT: Used for interactive UI bots and client-side automation.
  - BASH/SHELL: Used for Termux and Kali Linux utility scripts.
- DATABASE/PERSISTENCE: You use the Firebase Web SDK (v9 compat) for real-time Firestore data storage and Authentication.
- UTILITY: You utilize Tailwind CSS (via CDN) and Lucide Icons (via CDN) for professional styling.

BOT ARCHITECT PROTOCOLS (SUPER SMART):
- If the user commands a "Bot", analyze the required engine:
  - For WEB/UI interactions: Use JavaScript within script.js or a new JS node.
  - For DATA/AUTOMATION/SCRAPING: Use Python 3.11 within bot_logic.py or main.py.
  - For SYSTEM/TERMINAL tools: Use Bash scripts.
- FULL EXECUTION: Write 100% of the bot logic. Implement loops, request handlers, and state management. No "todo" comments.

ABSOLUTE EXECUTION PROTOCOLS (NO RUBBISH):
- NO SELF-BRANDING (CRITICAL): Do NOT add "Jimskay Studio", badges, headers, or watermarks.
- NO PLACEHOLDERS: You write EVERYTHING. No skipping logic.
- MODULAR SYNTHESIS: ONLY return the files that you have MODIFIED or CREATED in the 'modifiedFiles' array.

STRICT VERTICAL ARRANGEMENT (MANDATORY):
- YOU MUST USE REAL NEWLINE CHARACTERS (\n) BETWEEN EVERY SINGLE ELEMENT. 
- EVERY tag must occupy its own distinct line.
`,
  prompt: `
CURRENT PROJECT TELEMETRY:
{{#each files}}
FILE: {{{name}}}
\`\`\`{{{language}}}
{{{content}}}
\`\`\`
{{/each}}

{{#if imageUrl}}
OPTICAL TELEMETRY ATTACHED: {{media url=imageUrl}}
Analyze the visual data above and synthesize the project/bot accordingly.
{{/if}}

ACTIVE FOCUS: {{{activeFileName}}}
CREATOR ACCESS: {{#if isCreator}}LEVEL 1 (GOD MODE ACTIVE){{else}}LEVEL 0 (MENTOR){{/if}}

COMMAND: 
{{{command}}}

TASK:
Populate 'thoughts', synthesize modified files, and provide explanation. 
If a Bot, Backend, or Database is requested, utilize Python, JavaScript, or Firebase appropriately.
Provide STRICT LINE-BY-LINE ARRANGEMENT.
`,
});

const studioFlow = ai.defineFlow(
  {
    name: 'studioFlow',
    inputSchema: StudioInputSchema,
    outputSchema: StudioOutputSchema,
  },
  async (input) => {
    // Neural model router: 3.5-flash -> 2.5-flash -> 3.5-flash-lite ladder
    // across every free API key. Retries key/model combos internally; throws only on
    // fatal errors or when the entire matrix is exhausted. If a response still hits its
    // output limit (finishReason 'length'), follow-up rounds keep synthesizing on the
    // next key, merging each parsed payload until every file write is delivered.
    const maxRounds = 1 + MAX_CONTINUATIONS;
    const fileMap = new Map<string, { name: string; content: string; language: string }>();
    for (const f of input.files) fileMap.set(f.name, f);
    const delivered = new Map<string, { name: string; content: string; language: string }>();

    let latestThoughts = '';
    let latestExplanation = '';
    let latestText = '';
    let anyParsed = false;
    let truncatedAfterRounds = false;

    for (let round = 0; round < maxRounds; round++) {
      const isContinuation = round > 0;
      if (isContinuation) keyManager.rotateKey(); // give the key that hit its budget a rest

      const roundInput: StudioInput = isContinuation
        ? {
            ...input,
            // Feed every file delivered so far back as project telemetry so the model
            // can see what already exists and finish only what is still missing.
            files: Array.from(fileMap.values()),
            command: `${input.command}${ARCHITECT_CONTINUATION_CMD}`,
          }
        : input;

      const response = await withModelFallback({
        mode: 'studio',
        run: (model) =>
          studioPrompt(roundInput, {
            model,
            config: { temperature: 0.1, maxOutputTokens: MAX_OUTPUT_TOKENS },
          }),
      }).catch((error: unknown) => {
        if (isContinuation) {
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('completely exhausted')) {
            // Key matrix dried up mid-synthesis — keep whatever was already delivered.
            truncatedAfterRounds = true;
            return null;
          }
        }
        throw error;
      });
      if (response === null) break;

      const rawText = response.text || '';
      latestText = rawText;

      let parsed: StudioOutput | null = parseStudioOutput(rawText);
      if (!parsed) {
        // Last-resort: let Genkit's own output parser try (it may handle formats our
        // extractor missed), then fall back to its null on genuinely invalid JSON.
        try {
          const native = (response as { output?: unknown }).output;
          if (native && typeof native === 'object' && Array.isArray((native as { modifiedFiles?: unknown }).modifiedFiles)) {
            parsed = native as StudioOutput;
          }
        } catch {
          // Not valid structured output — leave parsed as null.
        }
      }

      if (parsed) {
        anyParsed = true;
        if (parsed.thoughts) latestThoughts = parsed.thoughts;
        if (parsed.explanation) latestExplanation = parsed.explanation;
        for (const file of parsed.modifiedFiles ?? []) {
          if (file && file.name) {
            const entry = { name: file.name, content: file.content ?? '', language: file.language ?? '' };
            // Latest content wins per file name across rounds.
            fileMap.set(entry.name, entry);
            delivered.set(entry.name, entry);
          }
        }
      }

      const cutOff =
        response.finishReason === 'length' ||
        parsed?.continue === true ||
        (!parsed && looksIncomplete(rawText, response.finishReason));
      if (!cutOff) break; // genuinely finished this round
      if (round === maxRounds - 1) {
        truncatedAfterRounds = anyParsed; // out of rounds while still partial
        break;
      }
    }

    if (!anyParsed) {
      throw new Error(
        'Neural link timed out: the Studio Architect could not produce a valid synthesis' +
          (latestText ? ` (last output began: ${latestText.slice(0, 160)}…)` : '.')
      );
    }
    if (truncatedAfterRounds) {
      latestExplanation = [
        latestExplanation,
        '\n\n[Note: the synthesis hit the output limit across every continuation round, so the file list above may still be partial. Re-run the command to deliver the remainder.]',
      ]
        .filter(Boolean)
        .join('');
    }

    return {
      thoughts: latestThoughts,
      modifiedFiles: Array.from(delivered.values()),
      explanation: latestExplanation,
    } as StudioOutput;
  }
);
