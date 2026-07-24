/**
 * scripts/lib/models/providers.ts
 *
 * Provider metadata + environment API-key resolution. This is the "once a model
 * is selected, request the environment API key so we can make the call" step:
 * given a model's provider, resolve the right env var, and if it's missing emit
 * a clear, actionable message (which var to set, where to get the key).
 *
 * Mirrors the existing per-rail pattern (fal.ts configureFal: read process.env.FAL_KEY
 * or throw), generalized across every provider in the registry. DB-free.
 */

import type { Provider } from "./registry.js";

export interface ProviderInfo {
  id: Provider;
  label: string;
  /** Env var that holds this provider's API key. */
  envKey: string;
  /** Where the user gets a key / manages the console. */
  signupUrl: string;
  /** Client/SDK hint for the future dispatch wiring. */
  client: string;
}

export const PROVIDERS: Record<Provider, ProviderInfo> = {
  google: {
    id: "google",
    label: "Google AI Studio (Gemini API)",
    envKey: "GOOGLE_API_KEY",
    signupUrl: "https://aistudio.google.com/apikey",
    client: "@google/genai",
  },
  fal: {
    id: "fal",
    label: "fal.ai",
    envKey: "FAL_KEY",
    signupUrl: "https://fal.ai/dashboard/keys",
    client: "@fal-ai/client",
  },
  byteplus: {
    id: "byteplus",
    label: "BytePlus ModelArk (ByteDance)",
    envKey: "BYTEPLUS_API_KEY",
    signupUrl: "https://console.byteplus.com/",
    client: "REST (BytePlus ModelArk — Node SDK, async submit-poll)",
  },
  runway: {
    id: "runway",
    label: "Runway",
    envKey: "RUNWAY_API_KEY",
    signupUrl: "https://dev.runwayml.com/",
    client: "REST (dev.runwayml.com)",
  },
  replicate: {
    id: "replicate",
    label: "Replicate",
    envKey: "REPLICATE_API_TOKEN",
    signupUrl: "https://replicate.com/account/api-tokens",
    client: "replicate (HTTP)",
  },
  openai: {
    id: "openai",
    label: "OpenAI (Sora — disqualified)",
    envKey: "OPENAI_API_KEY",
    signupUrl: "https://platform.openai.com/api-keys",
    client: "openai (DISQUALIFIED — API sunsets 2026-09-24)",
  },
};

export interface ApiKeyStatus {
  provider: Provider;
  envKey: string;
  present: boolean;
}

/** Non-throwing: is this provider's env API key present? */
export function resolveApiKey(provider: Provider): ApiKeyStatus {
  const info = PROVIDERS[provider];
  const value = process.env[info.envKey];
  return { provider, envKey: info.envKey, present: Boolean(value && value.trim()) };
}

/**
 * Throwing: return the key or fail with an actionable message. Call this right
 * before dispatching a generation for a selected model.
 */
export function requireApiKey(provider: Provider): string {
  const info = PROVIDERS[provider];
  const value = process.env[info.envKey];
  if (!value || !value.trim()) {
    throw new Error(
      `Missing ${info.envKey} for ${info.label}. ` +
        `Set ${info.envKey} in .env.local (get a key: ${info.signupUrl}).`
    );
  }
  return value;
}

export function getProvider(provider: Provider): ProviderInfo {
  return PROVIDERS[provider];
}
