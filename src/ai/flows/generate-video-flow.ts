'use server';
/** Content-aware video generation with AI-planned, stateful extensions. */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateVideoInputSchema = z.object({
  prompt: z.string().min(1).max(12_000).describe('The subject, story, or scene to synthesize.'),
  aspectRatio: z.enum(['16:9', '9:16']).default('16:9'),
  qualityProfile: z.enum(['educational', 'cinematic', 'documentary', 'diagrammatic']).default('cinematic'),
  cameraMotion: z.string().max(600).optional().describe('Optional camera direction such as slow push-in, locked-off, or lateral tracking.'),
  negativePrompt: z.string().max(1_500).optional().describe('Things that must not appear in the shot.'),
  continuityKey: z.string().max(200).optional(),
  teachingPurpose: z.enum(['establish','introduce','explain','demonstrate','derive','compare','emphasize','check','recap']).optional(),
});

const VideoPlanSchema = z.object({
  durationSeconds: z.number().int().min(5).max(8),
});

const GenerateVideoOutputSchema = z.object({
  videoUrl: z.string().describe('The generated MP4 as a data URI.'),
  durationSeconds: z.number(),
  aspectRatio: z.string(),
});

export type GenerateVideoInput = z.infer<typeof GenerateVideoInputSchema>;
export type GenerateVideoOutput = z.infer<typeof GenerateVideoOutputSchema>;

function buildDirectedPrompt(input: GenerateVideoInput): string {
  const profile = {
    educational: 'clear instructional cinematography, accurate physical relationships, legible visual focus',
    cinematic: 'cinematic lighting and depth, deliberate camera language, realistic material response, restrained visual effects',
    documentary: 'observational documentary framing, natural movement, realistic environment, credible scale',
    diagrammatic: 'clean studio visualization, precise composition, simple background, high legibility, controlled motion',
  }[input.qualityProfile];

  const camera = input.cameraMotion || 'choose camera placement and movement that best serves the scene';
  const negative = input.negativePrompt || 'no logos, no watermarks, no unintelligible text';

  return [
    'Create a polished video that fulfills the request; do not assume it is educational.',
    `Subject and action: ${input.prompt}`,
    `Aspect ratio: ${input.aspectRatio}.`,
    `Visual profile: ${profile}.`,
    `Camera: ${camera}.`,
    input.teachingPurpose ? `Teaching purpose: ${input.teachingPurpose}.` : '',
    input.continuityKey ? `Continuity subject key: ${input.continuityKey}; preserve this identity.` : '',
    `Avoid: ${negative}.`,
  ].join(' ');
}

async function planVideo(prompt: string): Promise<z.infer<typeof VideoPlanSchema>> {
  const { output } = await ai.generate({
    model: 'googleai/gemini-3.5-flash',
    prompt: [
      'Choose a natural duration for a single generated video shot based on the scope and pacing of the user request. Keep simple moments shorter and complex action or detail toward the upper limit. Do not force educational framing.',
      'Return an integer durationSeconds from 5 through 8, the supported range of the video provider.',
      `User request: ${prompt}`,
    ].join('\n\n'),
    output: { schema: VideoPlanSchema },
  });
  if (!output) throw new Error('The video planner returned no duration.');
  return output;
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  return generateVideoFlow(input);
}

const generateVideoFlow = ai.defineFlow(
  {
    name: 'generateVideoFlow',
    inputSchema: GenerateVideoInputSchema,
    outputSchema: GenerateVideoOutputSchema,
  },
  async (input) => {
    const plan = await planVideo(input.prompt);
    let { operation } = await ai.generate({
      model: 'googleai/veo-2.0-generate-001',
      prompt: buildDirectedPrompt(input),
      config: {
        durationSeconds: plan.durationSeconds,
        aspectRatio: input.aspectRatio,
      },
    });

    if (!operation) throw new Error('Video generation returned no operation.');

    const deadline = Date.now() + 5 * 60 * 1000;
    while (!operation.done) {
      if (Date.now() >= deadline) throw new Error('Video generation timed out after five minutes.');
      await new Promise((resolve) => setTimeout(resolve, 5000));
      operation = await ai.checkOperation(operation);
    }

    if (operation.error) throw new Error(`Video generation failed: ${operation.error.message}`);

    const videoPart = operation.output?.message?.content.find((part) => !!part.media);
    if (!videoPart?.media?.url) throw new Error('Video generation completed without returning a video file.');

    const downloadUrl = new URL(videoPart.media.url);
    if (process.env.GEMINI_API_KEY) downloadUrl.searchParams.set('key', process.env.GEMINI_API_KEY);
    const videoResponse = await fetch(downloadUrl);
    if (!videoResponse.ok) {
      const responseDetail = (await videoResponse.text()).slice(0, 500);
      throw new Error(`Generated video download failed (${videoResponse.status}): ${responseDetail}`);
    }

    const buffer = await videoResponse.arrayBuffer();
    if (buffer.byteLength === 0) throw new Error('Video generation returned an empty file.');

    return {
      videoUrl: `data:video/mp4;base64,${Buffer.from(buffer).toString('base64')}`,
      durationSeconds: plan.durationSeconds,
      aspectRatio: input.aspectRatio,
    };
  }
);
