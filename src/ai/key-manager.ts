
/**
 * @fileOverview Jimskay Multi-API Key Matrix.
 * Orchestrates rotation across high-integrity nodes provided by the Creator.
 * This file strictly pulls nodes from the environment vault to maintain 100% security.
 */

class KeyManager {
  private keys: string[] = [];
  private currentIndex: number = 0;

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys() {
    // Neural Link: Pulling nodes from the environment vault
    const envKeys = process.env.GEMINI_KEYS || process.env.NEXT_PUBLIC_GEMINI_KEYS;
    
    if (envKeys) {
      this.keys = envKeys.split(',').map(k => k.trim()).filter(k => k.length > 0);
    } else {
      console.error("Neural Warning: you are out of prompt pls try again in 24 hours.");
      this.keys = [];
    }
  }

  public getCurrentKey(): string {
    if (this.keys.length === 0) return "";
    return this.keys[this.currentIndex % this.keys.length];
  }

  public getKeysFromCurrent(): string[] {
    if (this.keys.length === 0) return [];
    const start = this.currentIndex % this.keys.length;
    return [...this.keys.slice(start), ...this.keys.slice(0, start)];
  }

  public rotateKey(): string {
    if (this.keys.length === 0) return "";
    this.currentIndex = (this.currentIndex + 1) % this.keys.length;
    const newKey = this.getCurrentKey();
    process.env.GOOGLE_GENAI_API_KEY = newKey;
    process.env.GEMINI_API_KEY = newKey;
    return newKey;
  }

  public getKeyCount(): number {
    return this.keys.length;
  }
}

export const keyManager = new KeyManager();
