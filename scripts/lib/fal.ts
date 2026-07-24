/**
 * scripts/lib/fal.ts
 *
 * Shared, Supabase-free fal.ai image generation core — a sibling to imagen.ts.
 * Prompt → fal model (FLUX et al.) → PNG files on disk. fal returns *hosted*
 * image URLs, so we fetch each URL and write the bytes locally to match the
 * Imagen rail's "files on disk" contract.
 *
 * Used by the CLI (generate-fal.ts). Requires FAL_KEY (set in .env.local).
 */

import fs from "fs";
import path from "path";
import { fal } from "@fal-ai/client";
import {
  slugify,
  timestamp,
  coerceImagenAspect,
  type GeneratedFile,
} from "./imagen.js";
import { sleep } from "./retry.js";

/** Resolve FAL_KEY and configure the fal client — shared by every fal-backed rail. */
export function configureFal(apiKey?: string): void {
  const key = apiKey ?? process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is not set");
  fal.config({ credentials: key });
}

/**
 * Download a hosted result to disk with short retries. Generation is already
 * paid for by the time this runs, so we retry the DOWNLOAD only — never the
 * generation — before giving up.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  opts: { retries?: number; label?: string } = {}
): Promise<number> {
  const retries = opts.retries ?? 3;
  const label = opts.label ?? "download";
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.length) throw new Error("empty response body");
      fs.writeFileSync(destPath, bytes);
      return bytes.length;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const wait = 2000 * Math.pow(2, attempt);
        console.warn(
          `  ⏳ ${label} failed (${err instanceof Error ? err.message : err}) — retrying in ${wait / 1000}s`
        );
        await sleep(wait);
      }
    }
  }
  throw new Error(
    `${label} failed after ${retries + 1} attempts: ${lastErr instanceof Error ? lastErr.message : lastErr}`
  );
}

/**
 * Short aliases → fal model IDs. Pass an alias or any full fal model ID
 * (e.g. "fal-ai/recraft/v3/text-to-image") to --model. Default: flux-dev.
 */
export const FAL_IMAGE_MODELS: Record<string, string> = {
  "flux-dev": "fal-ai/flux/dev",
  "flux-schnell": "fal-ai/flux/schnell",
  "flux-pro": "fal-ai/flux-pro/v1.1",
  "flux-pro-ultra": "fal-ai/flux-pro/v1.1-ultra",
  recraft: "fal-ai/recraft/v3/text-to-image",
  "sd35": "fal-ai/stable-diffusion-v35-large",
  ideogram: "fal-ai/ideogram/v2",
  "nano-banana": "fal-ai/nano-banana",
};

export const DEFAULT_FAL_IMAGE_MODEL = "flux-dev";

/** Resolve an alias (or pass-through a full fal model ID). */
export function resolveFalModel(model?: string): string {
  if (!model) return FAL_IMAGE_MODELS[DEFAULT_FAL_IMAGE_MODEL]!;
  return FAL_IMAGE_MODELS[model] ?? model;
}

/**
 * Map a "w:h" aspect to a fal `image_size` preset. fal's FLUX presets cover the
 * same five ratios Imagen supports, so we snap arbitrary input (e.g. 4:5) to the
 * nearest supported ratio first, then translate to the preset string.
 */
export function aspectToFalImageSize(aspect: string): string {
  const snapped = coerceImagenAspect(aspect);
  const map: Record<string, string> = {
    "1:1": "square_hd",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
  };
  return map[snapped] ?? "square_hd";
}

export interface FalGenerateOptions {
  prompt: string;
  /** Directory to write images into (created if missing). */
  outDir: string;
  /** Model alias (see FAL_IMAGE_MODELS) or a full fal model ID. */
  model?: string;
  /** Images to generate. Default 1. */
  count?: number;
  /** Aspect ratio, e.g. "16:9", "1:1". Default "1:1". */
  aspect?: string;
  /** Friendly name used in the filename slug. Falls back to the prompt. */
  name?: string;
  /** Overrides FAL_KEY env var. */
  apiKey?: string;
}

/** fal image payloads share this shape across the common text-to-image models. */
interface FalImage {
  url: string;
  content_type?: string;
}

function extImage(contentType?: string): string {
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  return "png";
}

/**
 * Generate one prompt's image(s) via fal.ai and write them to disk.
 * Throws on missing API key or empty result. Returns the files written.
 */
export async function generateFalImage(
  opts: FalGenerateOptions
): Promise<GeneratedFile[]> {
  configureFal(opts.apiKey);

  const modelId = resolveFalModel(opts.model);
  const count = Math.max(1, opts.count ?? 1);
  const imageSize = aspectToFalImageSize(opts.aspect ?? "1:1");
  fs.mkdirSync(opts.outDir, { recursive: true });

  const result = await fal.subscribe(modelId, {
    input: {
      prompt: opts.prompt,
      image_size: imageSize,
      num_images: count,
    },
    logs: false,
  });

  const data = (result?.data ?? {}) as { images?: FalImage[]; image?: FalImage };
  const images: FalImage[] = data.images ?? (data.image ? [data.image] : []);
  if (images.length === 0) {
    throw new Error(
      `No image returned from ${modelId} (prompt may have been blocked)`
    );
  }

  const base = slugify(opts.name ?? opts.prompt);
  const stamp = timestamp();
  const written: GeneratedFile[] = [];

  for (let idx = 0; idx < images.length; idx++) {
    const img = images[idx]!;
    const suffix = images.length > 1 ? `-${idx + 1}` : "";
    const filename = `${base}-${stamp}${suffix}.${extImage(img.content_type)}`;
    const fullPath = path.join(opts.outDir, filename);
    const bytes = await downloadFile(img.url, fullPath, { label: `fal image ${idx + 1}` });
    written.push({ filename, fullPath, bytes });
  }

  return written;
}
