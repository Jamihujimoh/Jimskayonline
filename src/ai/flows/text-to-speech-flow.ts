
'use server';
/**
 * @fileOverview A flow to convert text to speech using Gemini's TTS model.
 * Enhanced with resilient WAV encoding and diagnostic logging.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import wav from 'wav';

const TtsInputSchema = z.string().describe("The text to be converted to speech.");
export type TtsInput = z.infer<typeof TtsInputSchema>;

const TtsOutputSchema = z.object({
  audioUrl: z.string().describe("The base64 encoded data URI of the synthesized audio in WAV format."),
});
export type TtsOutput = z.infer<typeof TtsOutputSchema>;

export async function synthesizeSpeech(input: TtsInput): Promise<TtsOutput> {
  return ttsFlow(input);
}

const ttsFlow = ai.defineFlow(
  {
    name: 'ttsFlow',
    inputSchema: TtsInputSchema,
    outputSchema: TtsOutputSchema,
  },
  async (text) => {
    try {
      // Clean text of characters that might disrupt neural speech synthesis
      const cleanText = text.replace(/[#*`_]/g, '').trim();
      
      if (!cleanText) throw new Error("Synthesis aborted: No conceptual data to vocalize.");

      const { media } = await ai.generate({
        model: 'googleai/gemini-2.5-flash-preview-tts',
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Algenib' },
            },
          },
        },
        prompt: cleanText,
      });

      if (!media || !media.url) {
        throw new Error('Neural voice synthesis failure: Protocol returned no audio data.');
      }

      const audioBuffer = Buffer.from(
        media.url.substring(media.url.indexOf(',') + 1),
        'base64'
      );
      
      const wavBase64 = await toWav(audioBuffer);

      return {
        audioUrl: 'data:audio/wav;base64,' + wavBase64,
      };
    } catch (error: any) {
      console.error("TTS Synthesis Protocol Failure:", error);
      throw new Error(error.message || "Synthesis failure: Neural voice link unstable.");
    }
  }
);

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const writer = new wav.Writer({
        channels,
        sampleRate: rate,
        bitDepth: sampleWidth * 8,
      });

      let bufs: Buffer[] = [];
      writer.on('error', (err) => {
        console.error("WAV Writer Protocol Error:", err);
        reject(err);
      });
      writer.on('data', (d: Buffer) => bufs.push(d));
      writer.on('end', () => {
        resolve(Buffer.concat(bufs).toString('base64'));
      });

      writer.write(pcmData);
      writer.end();
    } catch (e) {
      reject(e);
    }
  });
}
