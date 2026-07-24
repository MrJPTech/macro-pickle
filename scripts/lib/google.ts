/**
 * scripts/lib/google.ts
 *
 * One memoized GoogleGenAI client per API key. Every Google rail (Imagen, Veo,
 * Nano Banana, Gemini vision/text) resolves its client here instead of
 * repeating the env-guard + construction in each module.
 */
import { GoogleGenAI } from "@google/genai";

const clients = new Map<string, GoogleGenAI>();

export function getGoogleClient(apiKey?: string): GoogleGenAI {
  const key = apiKey ?? process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is not set");
  let client = clients.get(key);
  if (!client) {
    client = new GoogleGenAI({ apiKey: key });
    clients.set(key, client);
  }
  return client;
}
