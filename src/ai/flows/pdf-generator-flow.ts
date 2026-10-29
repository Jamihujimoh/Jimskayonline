import {
  PdfInputSchema,
  generatePdfInMemory,
} from './pdf-engine';

/**
 * PDF generator v2 — thin Genkit wrapper.
 *
 * All rendering logic (LaTeX/chemistry processing, Markdown -> HTML, the
 * print-ready publication template, and the headless Chrome render) lives in
 * `./pdf-engine`, which is deliberately free of any `@/ai/genkit` dependency
 * so it can be unit-tested and invoked standalone. This file only registers
 * the tool and re-exports the pieces the chat flow / UI rely on.
 */

export { PdfInputSchema, generatePdfInMemory };

export async function generatePdf(input: Parameters<typeof generatePdfInMemory>[0]) {
  return generatePdfInMemory(input);
}