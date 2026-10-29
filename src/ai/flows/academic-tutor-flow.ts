
'use server';
/**
 * @fileOverview Academic synthesis flow for Advanced Learning and Mastery.
 * Optimized for STRICT 40-question batch generation with high-token buffer.
 * Enhanced for LaTeX mathematical synthesis and curriculum coverage.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AcademicInputSchema = z.object({
  subject: z.string().describe("The subject for the mock session."),
  difficulty: z.enum(['Standard', 'Advanced']).default('Standard'),
});

const AcademicOutputSchema = z.object({
  questions: z.array(z.object({
    id: z.string(),
    question: z.string(),
    options: z.array(z.string()),
    correctAnswer: z.string(),
    explanation: z.string(),
  })),
});

export type AcademicInput = z.infer<typeof AcademicInputSchema>;
export type AcademicOutput = z.infer<typeof AcademicOutputSchema>;

export async function generateMockExam(input: AcademicInput): Promise<AcademicOutput> {
  return academicTutorFlow(input);
}

const academicPrompt = ai.definePrompt({
  name: 'academicTutorPrompt',
  model: 'googleai/gemini-3.5-flash',
  input: { schema: AcademicInputSchema },
  output: { schema: AcademicOutputSchema },
  config: {
    maxOutputTokens: 8192, 
    temperature: 0.9,
  },
  prompt: `
You are Jimoh Jamihu Adekilekun, an expert academic tutor for students preparing for advanced exams.

TASK:
Generate a unique, 40-question mock examination for: {{{subject}}}.

PROTOCOL:
1. CURRICULUM: Cover the entire curriculum for this subject. Do not repeat topics.
2. RANDOMIZATION: Change all numbers and scenarios. Never return the same questions twice.
3. MATH: Use LaTeX for ALL formulas. Inline: $...$. Block: $$. Exactly 40 questions.

Subject: {{{subject}}}
Difficulty: {{{difficulty}}}
`,
});

const academicTutorFlow = ai.defineFlow(
  {
    name: 'academicTutorFlow',
    inputSchema: AcademicInputSchema,
    outputSchema: AcademicOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await academicPrompt(input);
      
      if (!output || !output.questions || output.questions.length < 1) {
        throw new Error("Empty response from academic grid.");
      }

      return {
        questions: output.questions
      };
    } catch (error: any) {
      console.error("Academic Synthesis Failure:", error);
      throw new Error("Could not sync with the academic grid. The session was too large or timed out. Please try again.");
    }
  }
);
