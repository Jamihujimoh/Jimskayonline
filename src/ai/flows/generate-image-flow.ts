'use server';
/**
 * @fileOverview Neural Visualization flow using Imagen 3.0 (Fast).
 * Optimized for standard free-tier visual synthesis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const GenerateImageInputSchema = z.object({
  prompt: z.string().describe("A detailed description of the image to be generated."),
});

const GenerateImageOutputSchema = z.object({
  imageUrl: z.string().describe("The base64 encoded data URI of the generated image."),
});

export async function generateImage(input: z.infer<typeof GenerateImageInputSchema>) {
  try {
    // googleai/imagen-3.0-generate-001 is the standard verified high-performance free model
    const { media } = await ai.generate({
      model: 'googleai/imagen-3.0-generate-001',
      prompt: input.prompt,
    });

    if (!media || !media.url) {
      throw new Error('Neural Imaging Synthesis failure: Protocol returned no visual data.');
    }

    return { imageUrl: media.url };
  } catch (error: any) {
    throw new Error(error.message || 'Imaging Synthesis Failed: Model link unstable.');
  }
}