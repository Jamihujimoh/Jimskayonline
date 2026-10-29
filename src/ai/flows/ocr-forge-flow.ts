'use server';
/**
 * @fileOverview Optical Forge: High-Fidelity Spatial OCR Synthesis.
 * Uses Gemini 1.5 Flash to detect text and return precise spatial coordinates.
 * Optimized for layout preservation and color estimation.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const OcrInputSchema = z.object({
  imageDataUri: z.string().describe("The image to analyze as a data URI."),
});

const OcrOutputSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    text: z.string(),
    x: z.number().describe("X coordinate (0-1000)"),
    y: z.number().describe("Y coordinate (0-1000)"),
    width: z.number().describe("Width (0-1000)"),
    height: z.number().describe("Height (0-1000)"),
    color: z.string().optional().describe("Estimated text color in hex"),
    bgColor: z.string().optional().describe("Estimated background color in hex"),
  })),
});

export type OcrNode = z.infer<typeof OcrOutputSchema>['nodes'][0];

export async function performSpatialOcr(input: z.infer<typeof OcrInputSchema>) {
  return ocrForgeFlow(input);
}

const ocrForgeFlow = ai.defineFlow(
  {
    name: 'ocrForgeFlow',
    inputSchema: OcrInputSchema,
    outputSchema: OcrOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await ai.generate({
        model: 'googleai/gemini-1.5-flash',
        prompt: [
          { text: `Detect all text in this image. For every distinct block or line of text, provide its content and precise spatial coordinates.
          Coordinates must be normalized from 0 to 1000. 
          Also estimate the text color and the background color directly behind the text.
          Return ONLY a JSON object matching the requested schema.` },
          { media: { url: input.imageDataUri } }
        ],
        output: { schema: OcrOutputSchema }
      });

      if (!output || !output.nodes || output.nodes.length === 0) {
        throw new Error("Optical link failed to detect spatial nodes.");
      }

      return output;
    } catch (error: any) {
      console.error("OCR Flow Error:", error);
      throw new Error(error.message || "Neural imaging link unstable.");
    }
  }
);
