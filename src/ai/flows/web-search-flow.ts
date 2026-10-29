'use server';
/**
 * @fileOverview A registered Genkit Tool to perform professional web searches using SerpApi.
 * Over-engineered with dual-routing (Organic Search vs Google Images Search) and high-res image extraction.
 */

import { performSearch, type WebSearchOutput } from './web-search-core';

// 2. Ultra-Safe Server Action for Standalone Client Pages
export async function webSearch(input: any): Promise<WebSearchOutput> {
  try {
    let queryStr = "";

    if (!input) {
      return { results: "### Error\n\nSearch parameter was empty.", imageUrls: [] };
    }

    if (typeof input === 'string') {
      queryStr = input;
    } else if (typeof input === 'object') {
      if (typeof input.get === 'function') {
        queryStr = (input.get('query') || input.get('search')) as string || "";
      } else {
        queryStr = input.query || "";
      }
    }

    if (!queryStr.trim()) {
      return { results: "### Error\n\nSearch query string resolved to empty.", imageUrls: [] };
    }

    return await performSearch(queryStr);

  } catch (criticalCrash: any) {
    console.error("Critical Server Action wrapper intercepted a crash:", criticalCrash);
    return {
      results: `### Server Action Intercept Exception\n\nFailed to map data stream safely across serialization pipeline.`,
      imageUrls: []
    };
  }
}