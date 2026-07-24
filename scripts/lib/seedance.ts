/**
 * scripts/lib/seedance.ts
 *
 * Seedance 2.0 video generation via fal.ai (text-to-video + image-to-video).
 * #2 on the Artificial Analysis Video Arena (2026-07). Supabase-free.
 * fal.subscribe() polls internally; we race it against a wall-clock deadline and
 * wrap the submit in withRetry so a transient 429 backs off instead of failing.
 *
 * Models (verified fal.ai slugs, 2026-07-21):
 *   i2v  bytedance/seedance-2.0/image-to-video   ← start + END keyframe (image_url + end_image_url)
 *   t2v  bytedance/seedance-2.0/text-to-video
 *
 * Why Seedance for this pipeline: it's the keyframe workhorse Omni Flash lacks —
 * i2v takes both a first AND last frame, at up to 1080p / 15s with native audio.
 *
 * Env:  FAL_KEY  (set in .env.local)
 *
 * Pricing is PAID per second of output (no free tier) — estimate with
 * estimateSeedanceCost() before batching. Rates are conservative (round UP) so a
 * spend gate never under-charges; confirm the exact tier on the fal model page.
 */

import fs from "fs";
import path from "path";
import { fal } from "@fal-ai/client";
import { slugify, timestamp, mimeForImage } from "./imagen.js";
import { configureFal, downloadFile } from "./fal.js";
import { withRetry } from "./retry.js";
import { SEEDANCE_MODELS, type SeedanceKey } from "./model-ids.js";

export type SeedanceResolution = "480p" | "720p" | "1080p";
export type SeedanceDuration = number | "auto";

/**
 * $/second of OUTPUT, keyed by resolution. Deliberately conservative:
 *   - fal quotes i2v standard ≈ $0.3024/s (720p & 1080p) and a 720p fast tier
 *     ≈ $0.2419/s; t2v at 1080p WITH audio has been observed as high as $0.682/s.
 * We round UP so the spend gate over-estimates rather than under — confirm the
 * live tier on https://fal.ai/models/bytedance/seedance-2.0 before a big run.
 */
export const SEEDANCE_RATE_USD_PER_SEC: Record<SeedanceResolution, number> = {
  "480p": 0.24,
  "720p": 0.31,
  "1080p": 0.69,
};

/** Estimated USD for one Seedance clip. `"auto"` duration is estimated at 5s. */
export function estimateSeedanceCost(seconds: SeedanceDuration, resolution: SeedanceResolution): number {
  const secs = typeof seconds === "number" ? seconds : 5;
  return secs * SEEDANCE_RATE_USD_PER_SEC[resolution];
}

/** Local image file → base64 data URI accepted by fal `image_url` / `end_image_url`. */
function toDataUri(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return `data:${mimeForImage(filePath)};base64,${bytes.toString("base64")}`;
}

export interface SeedanceOptions {
  prompt: string;
  /** Local path → i2v seed / FIRST frame. Triggers i2v mode. */
  imagePath?: string;
  /** Local path → LAST frame lock (i2v only) — the start→end keyframe pair. */
  endImagePath?: string;
  /** Clip length: a number of seconds (4–15) or "auto". Default "auto". */
  duration?: SeedanceDuration;
  /** Output resolution. Default "1080p". */
  resolution?: SeedanceResolution;
  /** Aspect ratio. i2v also infers from the seed image if omitted. */
  aspect?: "auto" | "21:9" | "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  /** Whether Seedance generates native audio. Default true. */
  generateAudio?: boolean;
  /** Deterministic seed (optional). */
  seed?: number;
  outDir: string;
  name?: string;
  /** Force a model; default is i2v when an imagePath is given, else t2v. */
  model?: SeedanceKey;
  /** Overrides FAL_KEY env var. */
  apiKey?: string;
  /** Wall-clock cap on the fal job. Default 15 min. */
  maxWaitMs?: number;
  /** Called each time fal.ai emits a queue update. */
  onTick?: (sec: number) => void;
}

export interface SeedanceResult {
  file: string;
  bytes: number;
  seconds: number;
  model: SeedanceKey;
  /** Original fal.ai video URL (expires after ~1h). */
  videoUrl: string;
  estimatedCostUsd: number;
}

export async function generateSeedanceVideo(opts: SeedanceOptions): Promise<SeedanceResult> {
  configureFal(opts.apiKey);

  const isI2V = !!opts.imagePath;
  const modelKey: SeedanceKey = opts.model ?? (isI2V ? "i2v" : "t2v");
  const modelId = SEEDANCE_MODELS[modelKey];
  const duration = opts.duration ?? "auto";
  const resolution = opts.resolution ?? "1080p";
  const generateAudio = opts.generateAudio ?? true;

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    duration,
    resolution,
    generate_audio: generateAudio,
  };
  if (opts.aspect) input.aspect_ratio = opts.aspect;
  if (opts.seed !== undefined) input.seed = opts.seed;

  if (modelKey === "i2v") {
    if (!opts.imagePath) throw new Error("Seedance i2v needs an imagePath (first frame)");
    input.image_url = toDataUri(opts.imagePath);
    // The start→END keyframe pair — Seedance interpolates first to last.
    if (opts.endImagePath) input.end_image_url = toDataUri(opts.endImagePath);
  }

  const start = Date.now();
  const maxWait = opts.maxWaitMs ?? 15 * 60_000;

  // Submit under the shared retry policy (transient 429 → backoff), and race the
  // subscribe against a wall-clock deadline so a hung job can't stall a batch.
  const result = await withRetry(
    () => {
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Seedance job exceeded ${Math.round(maxWait / 60000)} min wall clock — check fal.ai request history before re-running (the job may still complete and bill)`)),
          maxWait
        );
      });
      return Promise.race([
        fal.subscribe(modelId, {
          input,
          onQueueUpdate: () => opts.onTick?.((Date.now() - start) / 1000),
        }),
        timeout,
      ]).finally(() => clearTimeout(timeoutHandle));
    },
    { label: `seedance ${modelKey}` }
  );

  const data = (result as { data?: { video?: { url?: string } } }).data;
  const videoUrl = data?.video?.url;
  if (!videoUrl) throw new Error("No video URL in Seedance response (possible safety block)");

  fs.mkdirSync(opts.outDir, { recursive: true });
  const slug = slugify(opts.name ?? opts.prompt);
  const filename = `${slug}-seedance-${modelKey}-${timestamp()}.mp4`;
  const full = path.join(opts.outDir, filename);

  let bytes: number;
  try {
    bytes = await downloadFile(videoUrl, full, { label: `seedance ${slug}` });
  } catch (err) {
    const recovery = path.join(opts.outDir, "_paid-recovery-urls.txt");
    fs.appendFileSync(recovery, `${new Date().toISOString()}  ${slug}  ${videoUrl}\n`);
    throw new Error(
      `Seedance render PAID but download failed — URL saved to ${recovery} (expires ~1h): ${err instanceof Error ? err.message : err}`
    );
  }

  return {
    file: full,
    bytes,
    seconds: (Date.now() - start) / 1000,
    model: modelKey,
    videoUrl,
    estimatedCostUsd: estimateSeedanceCost(duration, resolution),
  };
}
