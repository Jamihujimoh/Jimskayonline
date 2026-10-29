'use server';
/**
 * @fileOverview This file implements an AI flow that takes a short idea prompt
 * and expands upon it or suggests related concepts to foster further ideation.
 *
 * - expandIdeaPrompt - A function that handles the idea expansion process.
 * - ExpandIdeaPromptInput - The input type for the expandIdeaPrompt function.
 * - ExpandIdeaPromptOutput - The return type for the expandIdeaPrompt function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExpandIdeaPromptInputSchema = z.object({
  ideaPrompt: z
    .string()
    .describe("A short idea or concept to be expanded upon."),
});
export type ExpandIdeaPromptInput = z.infer<typeof ExpandIdeaPromptInputSchema>;

const ExpandIdeaPromptOutputSchema = z.object({
  expandedIdea: z
    .string()
    .describe("The expanded idea or related concepts based on the prompt."),
});
export type ExpandIdeaPromptOutput = z.infer<
  typeof ExpandIdeaPromptOutputSchema
>;

export async function expandIdeaPrompt(
  input: ExpandIdeaPromptInput
): Promise<ExpandIdeaPromptOutput> {
  return expandIdeaPromptFlow(input);
}

const expandIdeaPromptGenkitPrompt = ai.definePrompt({
  name: 'expandIdeaPromptGenkitPrompt',
  input: {schema: ExpandIdeaPromptInputSchema},
  output: {schema: ExpandIdeaPromptOutputSchema},
  prompt: `You are an AI assistant skilled at brainstorming and idea expansion. Given a short idea prompt, expand upon it, suggesting related concepts, potential features, or different angles to explore. Provide a detailed and creative expansion.

Idea Prompt: {{{ideaPrompt}}}`,
});

const expandIdeaPromptFlow = ai.defineFlow(
  {
    name: 'expandIdeaPromptFlow',
    inputSchema: ExpandIdeaPromptInputSchema,
    outputSchema: ExpandIdeaPromptOutputSchema,
  },
  async input => {
    const {output} = await expandIdeaPromptGenkitPrompt(input);
    return output!;
  }
);
