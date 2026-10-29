'use server';
/**
 * @fileOverview Strategic Intelligence Synthesis Flow.
 * Merges live web data with neural analysis to generate tactical reports.
 * UPGRADED: Leverages the Creator's Bulletproof Key Matrix Retry Protocol.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { webSearch } from './web-search-flow';
import { keyManager } from '@/ai/key-manager';

const IntelInputSchema = z.object({
  topic: z.string().describe("The topic to research."),
});

const IntelOutputSchema = z.object({
  summary: z.string().describe("High-level intelligence summary."),
  keyFacts: z.array(z.string()).describe("List of critical data points."),
  strategicImplication: z.string().describe("The 'so what' for the Creator."),
  confidenceLevel: z.number().describe("Percentage confidence in data grid."),
  imageUrls: z.array(z.string()).optional().describe("Optional list of image thumbnails."),
});

export type IntelInput = z.infer<typeof IntelInputSchema>;
export type IntelOutput = z.infer<typeof IntelOutputSchema>;

export async function generateIntelReport(input: IntelInput): Promise<IntelOutput> {
  return intelSynthesisFlow(input);
}

// 1. Define the prompt using the EXACT working model from your Chat Flow!
const reportPrompt = ai.definePrompt({
  name: 'intelSynthesisPrompt',
  model: 'googleai/gemini-3.1-flash-lite', // Same elite engine as chat
  input: { schema: z.object({ topic: z.string(), data: z.string() }) },
  output: { schema: IntelOutputSchema },
  prompt: `
PERSONAL IDENTITY:
You are the Jimskay Intelligence Officer, the Digital Twin of Jimoh Jamihu Adekilekun.

TASK:
Analyze the provided data grid for the topic: "{{{topic}}}".
Synthesize a professional tactical report for your Creator.

DATA GRID:
{{{data}}}

REPORT PROTOCOL:
1. Provide a concise but high-intelligence summary. Use technical nomenclature (Checksum, Synapse, Matrix).
2. Identify EXACT key facts (dates, names, technical specs).
3. Determine the strategic implication for a high-end programmer/student. Focus on technical supremacy or programmatic utility.
4. Set a confidence level (0-100) based on data density and source reliability.
`,
});

// 2. Define the flow wrapping the Creator's Matrix Retry Loop
const intelSynthesisFlow = ai.defineFlow(
  {
    name: 'intelSynthesisFlow',
    inputSchema: IntelInputSchema,
    outputSchema: IntelOutputSchema,
  },
  async (input) => {
    const maxRetries = keyManager.getKeyCount();
    let currentAttempt = 0;

    // First, fetch the search grid data
    const searchResponse = await webSearch({ query: input.topic });
    
    if (!searchResponse) {
      throw new Error("No communication established with search network.");
    }

    const formattedData = typeof searchResponse.results === 'string'
      ? searchResponse.results
      : JSON.stringify(searchResponse.results || [], null, 2);

    // Run the legendary Chat Flow key rotation protocol!
    while (currentAttempt < maxRetries) {
      try {
        const { output } = await reportPrompt({ 
          topic: input.topic, 
          data: formattedData 
        });

        if (!output) throw new Error("Intelligence synthesis link timeout.");

        return {
          ...output,
          imageUrls: searchResponse.imageUrls || []
        };

      } catch (error: any) {
        const msg = error.message || "";
        
        // If we hit any rate limit, restriction, block, or fake 404, rotate!
        if (
          msg.includes('429') || 
          msg.includes('403') || 
          msg.includes('denied') || 
          msg.includes('Forbidden') || 
          msg.includes('quota') ||
          msg.includes('404') ||
          msg.includes('not found')
        ) {
          keyManager.rotateKey();
          currentAttempt++;
          console.warn(`[Key Rotator] Synthesis failed. Rotating to key attempt ${currentAttempt}/${maxRetries}`);
          continue;
        }
        throw error;
      }
    }
    throw new Error("Neural Key Matrix completely exhausted during search synthesis.");
  }
);