'use server';
/**
 * @fileOverview Specialized analysis flow for Laboratory Prefect tasks.
 * Optimized for chemical safety synthesis and experimental analysis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const LabAnalysisInputSchema = z.object({
  context: z.enum(['CHEMICAL_SAFETY', 'PARADE_CHOREOGRAPHY']).describe("The type of analysis required."),
  query: z.string().describe("The specific question or item to analyze."),
});

const LabAnalysisOutputSchema = z.object({
  synthesis: z.string().describe("The detailed technical analysis or experimental steps."),
  recommendations: z.array(z.string()).describe("A list of specific safety warnings or procedures."),
});

export type LabAnalysisInput = z.infer<typeof LabAnalysisInputSchema>;
export type LabAnalysisOutput = z.infer<typeof LabAnalysisOutputSchema>;

export async function laboratoryAnalysis(input: LabAnalysisInput): Promise<LabAnalysisOutput> {
  return laboratoryAnalysisFlow(input);
}

const labPrompt = ai.definePrompt({
  name: 'laboratoryAnalysisPrompt',
  model: 'googleai/gemini-3.5-flash',
  input: { schema: LabAnalysisInputSchema },
  output: { schema: LabAnalysisOutputSchema },
  prompt: `
CONTEXT:
You are Jimoh Jamihu Adekilekun, the Laboratory Prefect at Command Day Secondary School Ede.

TASK:
Provide expert synthesis based on the following context:
Context Type: {{{context}}}
Query: {{{query}}}

INSTRUCTIONS:
- If CHEMICAL_SAFETY: Provide detailed properties, safety protocols (PPE), and storage requirements for the chemical. Be professional and mature.
- If PARADE_CHOREOGRAPHY: Analyze the parade move, including execution, timing, formations, safety, and improvement points.
- Maintain your human persona. Go straight to the point.

Return your response as a valid JSON object matching the requested schema.
`,
});

const laboratoryAnalysisFlow = ai.defineFlow(
  {
    name: 'laboratoryAnalysisFlow',
    inputSchema: LabAnalysisInputSchema,
    outputSchema: LabAnalysisOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await labPrompt(input);
      if (!output) throw new Error("Neural synthesis returned empty data.");
      return output;
    } catch (error: any) {
      console.error("Lab Synthesis Error:", error);
      throw new Error(error.message || "Lab synthesis link failed.");
    }
  }
);
