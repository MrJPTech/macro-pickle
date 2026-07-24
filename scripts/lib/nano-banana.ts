/**
 * scripts/lib/nano-banana.ts
 *
 * Gemini "Nano Banana" image generation — text→image AND reference-image→image
 * (the latter locks a real person's face/tattoos into new frames). Two surfaces
 * over one shared core:
 *   - generateNanoBuffers : image buffers in memory (the scene:* pipeline)
 *   - generateWithRefs    : writes files to disk (pnpm nano / nano:refs)
 * Supabase-free.
 *
 * Models (verified live against the Generative Language API, 2026-06):
 *   "2"   gemini-3.1-flash-image   "Nano Banana 2"   (default — fast)
 *   "pro" gemini-3-pro-image       "Nano Banana Pro" (highest fidelity)
 *   "1"   gemini-2.5-flash-image   "Nano Banana"     (original)
 */

import fs from "fs";
import path from "path";
import { slugify, timestamp, mimeForImage } from "./imagen.js";
import { getGoogleClient } from "./google.js";

export const NANO_MODELS = {
  "2": "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
  "1": "gemini-2.5-flash-image",
} as const;
export type NanoModelKey = keyof typeof NANO_MODELS;

export const NANO_LABEL: Record<NanoModelKey, string> = {
  "2": "Nano Banana 2 (gemini-3.1-flash-image)",
  pro: "Nano Banana Pro (gemini-3-pro-image)",
  "1": "Nano Banana (gemini-2.5-flash-image)",
};

// Accept the toolkit keys ("2"/"pro"/"1"), the pipeline's descriptive aliases
// ("nano-banana-2"/"-pro"/""), or a raw Gemini image model id — all resolve to the
// verified-live IDs above.
const NANO_ALIASES: Record<string, string> = {
  ...NANO_MODELS,
  "nano-banana-2": NANO_MODELS["2"],
  "nano-banana-pro": NANO_MODELS.pro,
  "nano-banana": NANO_MODELS["1"],
};
function resolveNanoModel(model?: string): string {
  if (!model) return NANO_MODELS["2"];
  return NANO_ALIASES[model] ?? model;
}

export interface NanoRef {
  buffer: Buffer;
  mimeType: string;
}

export interface NanoImage {
  buffer: Buffer;
  mimeType: string;
  model: string;
  index: number;
}

export interface NanoBufOptions {
  prompt: string;
  /** In-memory reference images (identity / scene lock). */
  refs?: NanoRef[];
  /** Model alias ("2"/"pro"/"1" or "nano-banana*") or a raw Gemini image model id. */
  model?: string;
  /** "1:1","2:3","3:2","3:4","4:3","9:16","16:9","21:9". Default "16:9". */
  aspect?: string;
  imageSize?: "1K" | "2K" | "4K";
  /** Variations (separate calls). Default 1. */
  count?: number;
  apiKey?: string;
}

/**
 * Core generator — returns image buffers in memory (no disk). One API call per
 * variation; a blocked candidate is skipped with a warning so a batch keeps the
 * frames that did come back.
 */
export async function generateNanoBuffers(opts: NanoBufOptions): Promise<NanoImage[]> {
  const model = resolveNanoModel(opts.model);
  const aspect = opts.aspect ?? "16:9";
  const count = Math.max(1, opts.count ?? 1);
  const ai = getGoogleClient(opts.apiKey);

  const refParts = (opts.refs ?? []).map((r) => ({
    inlineData: { mimeType: r.mimeType, data: r.buffer.toString("base64") },
  }));
  // Reference images first, then the instruction text that refers to them.
  const parts = [...refParts, { text: opts.prompt }];

  const out: NanoImage[] = [];
  for (let i = 0; i < count; i++) {
    const res = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: aspect,
          ...(opts.imageSize ? { imageSize: opts.imageSize } : {}),
        },
      },
    });

    const cand = res.candidates?.[0];
    const outParts = cand?.content?.parts ?? [];
    const imagePart = outParts.find(
      (p) => (p as { inlineData?: { data?: string } }).inlineData?.data
    ) as { inlineData?: { data?: string; mimeType?: string } } | undefined;
    const b64 = imagePart?.inlineData?.data;
    if (!b64) {
      const fr = cand?.finishReason;
      console.warn(
        `  ⚠️  Candidate ${i + 1}/${count} returned no image${fr ? ` (finishReason ${fr})` : ""} — skipped.`
      );
      continue;
    }
    out.push({
      buffer: Buffer.from(b64, "base64"),
      mimeType: imagePart?.inlineData?.mimeType ?? "image/png",
      model,
      index: i,
    });
  }
  return out;
}

export interface NanoOptions {
  prompt: string;
  /** Reference image FILE PATHS (the real photos to preserve identity from). */
  refs?: string[];
  outDir: string;
  name?: string;
  model?: NanoModelKey;
  /** "1:1","2:3","3:2","3:4","4:3","9:16","16:9","21:9". Default "16:9". */
  aspect?: string;
  imageSize?: "1K" | "2K" | "4K";
  /** Number of variations (separate calls). Default 1. */
  count?: number;
  apiKey?: string;
}

export interface NanoFile {
  filename: string;
  fullPath: string;
  bytes: number;
}

/** Generate image(s) from a prompt + reference photo PATHS, written to disk. */
export async function generateWithRefs(opts: NanoOptions): Promise<NanoFile[]> {
  const refs: NanoRef[] = (opts.refs ?? []).map((f) => {
    if (!fs.existsSync(f)) throw new Error(`Reference image not found: ${f}`);
    return { buffer: fs.readFileSync(f), mimeType: mimeForImage(f) };
  });

  const images = await generateNanoBuffers({
    prompt: opts.prompt,
    refs,
    model: opts.model,
    aspect: opts.aspect,
    imageSize: opts.imageSize,
    count: opts.count,
    apiKey: opts.apiKey,
  });
  if (images.length === 0) throw new Error("No image returned — possibly safety-blocked");

  fs.mkdirSync(opts.outDir, { recursive: true });
  const total = Math.max(1, opts.count ?? 1);
  const base = slugify(opts.name ?? opts.prompt);
  const written: NanoFile[] = [];
  for (const img of images) {
    const suffix = total > 1 ? `-${img.index + 1}` : "";
    const filename = `${base}-${timestamp()}${suffix}.png`;
    const fullPath = path.join(opts.outDir, filename);
    fs.writeFileSync(fullPath, img.buffer);
    written.push({ filename, fullPath, bytes: img.buffer.length });
  }
  return written;
}
