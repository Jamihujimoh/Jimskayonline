'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { withGoogleApiKeyFallback } from '@/ai/google-key-router';

const InputSchema = z.object({
  text: z.string().min(1).max(8000),
  voice: z.string().optional(),
  style: z.string().optional(),
  language: z.string().optional(),
});

const OutputSchema = z.object({ audioDataUrl: z.string(), mimeType: z.string() });

export type GenerateNarrationInput = z.infer<typeof InputSchema>;
export type GenerateNarrationOutput = z.infer<typeof OutputSchema>;

export async function generateNarration(input: GenerateNarrationInput): Promise<GenerateNarrationOutput> {
  return generateNarrationFlow(input);
}

const generateNarrationFlow = ai.defineFlow(
  { name: 'generateNarrationFlow', inputSchema: InputSchema, outputSchema: OutputSchema },
  async (input) => withGoogleApiKeyFallback('Narration generation', async (keyedAi) => {
      const response = await keyedAi.generate({
        model: 'googleai/gemini-3.8-flash-tts',
        prompt: input.text,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: input.voice || 'Kore' },
            },
            ...(input.language ? { languageCode: input.language } : {}),
          },
        },
      });

      const mediaUrl = response.media?.url;
      if (!mediaUrl) throw new Error('Narration generation returned no audio.');
      return { audioDataUrl: mediaUrl, mimeType: 'audio/wav' };
    })
);
