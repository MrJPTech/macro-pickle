/**
 * scripts/lib/models/dispatch.ts
 *
 * The generation-pipeline SEAM. `runGeneration(modelId, req)` resolves the
 * model from the registry, enforces the environment API key is present
 * (requireApiKey — the "request the env key before we call" step), and routes
 * to the provider handler.
 *
 * SCAFFOLD: every provider handler is a typed stub that throws NotImplementedError
 * with a pointer to the existing rail / pattern to wire. The working path today
 * remains the direct CLIs (pnpm veo / kling / omni). Wiring these handlers is
 * tracked in the IT-MAN vault → Tools/AI-Video-Models/AI-Video-Models-Open-Items.
 */

import { getModel, type ModelEntry, type Provider } from "./registry.js";
import { requireApiKey } from "./providers.js";

export interface GenerationRequest {
  prompt?: string;
  /** Start / first frame for image-to-video. */
  imageUrl?: string;
  /** Last frame — enables start+end keyframe interpolation (where supported). */
  endImageUrl?: string;
  /** Reference images/videos for character/style consistency. */
  refs?: string[];
  durationSec?: number;
  aspect?: string;
  /** Directory to write the result into. */
  outDir?: string;
}

export interface GenerationResult {
  modelId: string;
  provider: Provider;
  files: string[];
  seconds: number;
}

export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotImplementedError";
  }
}

type Handler = (model: ModelEntry, req: GenerationRequest) => Promise<GenerationResult>;

/** Provider → generation handler. Stubs for now (scaffold). */
const HANDLERS: Record<Provider, Handler> = {
  google: async (m) => {
    const rail = m.endpoint.startsWith("veo") ? "veo.ts (pnpm veo)" : "omni.ts (pnpm omni)";
    throw new NotImplementedError(
      `google dispatch not wired for ${m.id}. Delegate to scripts/lib/${rail}.`
    );
  },
  fal: async (m) => {
    throw new NotImplementedError(
      `fal dispatch not wired for ${m.id} (${m.endpoint}). ` +
        `Add a fal.subscribe("${m.endpoint}", { input }) call — pattern in scripts/lib/fal.ts (images) + scripts/lib/kling.ts (video).`
    );
  },
  byteplus: async (m) => {
    throw new NotImplementedError(
      `byteplus dispatch not wired for ${m.id} (${m.endpoint}). ` +
        `Add the ModelArk submit-poll REST client (Node SDK) — the cheapest Seedance path.`
    );
  },
  runway: async (m) => {
    throw new NotImplementedError(
      `runway dispatch not wired for ${m.id} (${m.endpoint}). ` +
        `Add the dev.runwayml.com REST client — use only for Runway's own models (Aleph 2.0, Act-Two, Gen-4.5).`
    );
  },
  replicate: async (m) => {
    throw new NotImplementedError(`replicate dispatch not wired for ${m.id} (${m.endpoint}).`);
  },
  openai: async (m) => {
    throw new NotImplementedError(
      `${m.id} is DISQUALIFIED — Sora API sunsets 2026-09-24. Do not wire.`
    );
  },
};

/**
 * Unified generation entry (future membership pipeline). Resolves the model,
 * blocks disqualified models, enforces the env key, then dispatches.
 */
export async function runGeneration(
  modelId: string,
  req: GenerationRequest
): Promise<GenerationResult> {
  const model = getModel(modelId);
  if (!model) throw new Error(`Unknown model id: ${modelId}`);
  if (model.status === "disqualified") {
    throw new Error(`${model.id} is disqualified — ${model.notes ?? "do not use"}`);
  }
  requireApiKey(model.provider); // fail fast with an actionable message if the key is missing
  const handler = HANDLERS[model.provider];
  return handler(model, req);
}
