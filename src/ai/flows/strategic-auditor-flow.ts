'use server';
/**
 * @fileOverview Advanced Neural Strategic Auditor Flow.
 * Analyzes academic history to identify subject weaknesses and provide remediation protocols.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AuditInputSchema = z.object({
  history: z.array(z.object({
    subject: z.string(),
    score: z.number(),
    totalQuestions: z.number(),
    date: z.string(),
  })).describe("The user's mock exam history."),
  daysToMission: z.number().default(365),
});

const AuditOutputSchema = z.object({
  assessment: z.string().describe("Professional high-level diagnostic assessment."),
  subjectCriticality: z.array(z.object({
    subject: z.string(),
    syncRate: z.number(),
    status: z.enum(['CRITICAL', 'STABLE', 'OPTIMAL']),
  })),
  remediationPlan: z.string().describe("A 24-hour intensive study protocol."),
});

export type AuditInput = z.infer<typeof AuditInputSchema>;
export type AuditOutput = z.infer<typeof AuditOutputSchema>;

export async function generateNeuralAudit(input: AuditInput): Promise<AuditOutput> {
  return strategicAuditorFlow(input);
}

const auditPrompt = ai.definePrompt({
  name: 'strategicAuditorPrompt',
  input: { schema: AuditInputSchema },
  output: { schema: AuditOutputSchema },
  prompt: `
PERSONAL IDENTITY:
You are the Jimskay Neural Auditor, the strategic analyst for Jimoh Jamihu Adekilekun.

CONTEXT:
Analyze the user's calibration history across various subjects for the current Academic Mastery phase.

TASK:
1. Analyze the performance trends.
2. Identify which subjects are "CRITICAL" (Sync Rate < 50%), "STABLE" (50-80%), or "OPTIMAL" (>80%).
3. Generate a professional diagnostic assessment in your mature, technical persona.
4. Provide a concrete "24-Hour Intensive Protocol" to improve the lowest sync rate.

User History:
{{#each history}}
- {{{date}}}: {{{subject}}} | Score: {{{score}}}/{{{totalQuestions}}}
{{/each}}

Strict JSON output required.
`,
});

const strategicAuditorFlow = ai.defineFlow(
  {
    name: 'strategicAuditorFlow',
    inputSchema: AuditInputSchema,
    outputSchema: AuditOutputSchema,
  },
  async (input) => {
    try {
      const { output } = await auditPrompt(input);
      if (!output) throw new Error("Auditor link timeout.");
      return output;
    } catch (error: any) {
      console.error("Auditor Flow Error:", error);
      throw new Error("Neural Audit failed to synchronize.");
    }
  }
);
