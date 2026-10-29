import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const WebSearchInputSchema = z.object({
  query: z.string().describe('The search query for the internet.'),
});

export const WebSearchOutputSchema = z.object({
  results: z.string().describe('A formatted Markdown string of search results.'),
  imageUrls: z.array(z.string()).describe('A list of high-quality image URLs found in the search.'),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;
export type WebSearchOutput = z.infer<typeof WebSearchOutputSchema>;

export async function performSearch(query: string): Promise<WebSearchOutput> {
  const SERP_API_KEY = process.env.SERP_API_KEY;

  if (!SERP_API_KEY) {
    return {
      results: '### Global Search Link Offline\n\n**Diagnostic:** Missing `SERP_API_KEY` in environment vault.',
      imageUrls: [],
    };
  }

  const isImageSearch = /\b(image|picture|photo|pic|png|jpg|wallpaper|drawing|illustration)s?\b/i.test(query);

  try {
    const endpoint = isImageSearch ? 'google_images' : undefined;
    const params = new URLSearchParams({ q: query, api_key: SERP_API_KEY });
    if (endpoint) params.set('engine', endpoint);
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`);

    if (!response.ok) throw new Error('Intelligence link connection failed');

    const data = await response.json();
    const imageUrls: string[] = [];
    let results = '';

    if (isImageSearch) {
      results = `## Visual Intelligence Grid\n\nLoaded original digital nodes for search query: **${query}**\n\n`;
      if (data.images_results?.length) {
        data.images_results.slice(0, 6).forEach((image: any) => {
          const imageUrl = image.original || image.thumbnail;
          if (imageUrl) imageUrls.push(imageUrl);
        });
        data.images_results.slice(0, 4).forEach((image: any) => {
          results += `### [${image.title || 'Image Result'}](${image.link || image.original})\nSource: *${image.source || 'Web Node'}*\n\n`;
        });
      } else {
        results += "No matching visual assets found in Google's database.";
      }
    } else {
      results = '## Neural Search Synthesis\n\n';
      if (data.organic_results?.length) {
        data.organic_results.slice(0, 5).forEach((result: any) => {
          results += `### [${result.title}](${result.link})\n${result.snippet || '_No snippet available._'}\n\n`;
        });
      } else {
        results += 'No relevant global data found for this query.';
      }
      data.inline_images?.slice(0, 4).forEach((image: any) => {
        const imageUrl = image.original || image.thumbnail;
        if (imageUrl) imageUrls.push(imageUrl);
      });
    }

    return { results, imageUrls };
  } catch (error) {
    console.error('Web search execution helper error:', error);
    return {
      results: '### Link Error\n\nExternal network search protocol is currently unstable.',
      imageUrls: [],
    };
  }
}

export const webSearchTool = ai.defineTool(
  {
    name: 'webSearchTool',
    description: 'Use this tool to search the internet/Google for current information.',
    inputSchema: WebSearchInputSchema,
    outputSchema: WebSearchOutputSchema,
  },
  async (input) => performSearch(input.query),
);
