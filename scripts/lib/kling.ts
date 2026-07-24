/**
 * scripts/lib/kling.ts
 *
 * Kling video generation via fal.ai (text-to-video + image-to-video).
 * Supabase-free. fal.subscribe() handles polling internally — no manual loop needed.
 *
 * Model IDs live in the central registry (scripts/lib/models.ts) — Kling 3.0 as of
 * 2026-07 (i2v-pro/i2v-std/t2v-pro on v3, t2v-master on 2.1). Bump versions there.
 *
 * Env:  FAL_KEY  (set in .env.local)
 *
 * Key differences from Veo:
 *   - i2v aspect is inferred from the seed image — do NOT pass aspect_ratio for i2v
 *   - duration is "5" | "10" (string), not seconds int
 *   - end_image_url enables last-frame lock (Veo has no equivalent)
 *   - PAID per second of output — estimate with estimateKlingCost() before batching
 */

import fs from "fs";
import path from "path";
import { fal } from "@fal-ai/client";
import { slugify, timestamp, mimeForImage } from "./imagen.js";
import { configureFal, downloadFile } from "./fal.js";
import { withRetry } from "./retry.js";
import { KLING_MODELS, KLING_LABEL, type KlingKey } from "./model-ids.js";

// Model IDs + labels are centralized in scripts/lib/models.ts (Kling 3.0);
// re-exported here for existing importers.
export { KLING_MODELS, KLING_LABEL };
export type { KlingKey };

/**
 * $/second of OUTPUT video, keyed by model and whether native audio is on.
 * Verified against the fal.ai model pages 2026-07-21:
 *   - v3 pro i2v/t2v: $0.112/s audio-off, $0.168/s audio-on (voice control $0.196)
 *   - v3 standard i2v: ~$0.084/$0.126 (tier pricing varies — confirm per page)
 *   - v2.1 master t2v: $0.28/s flat
 *   - v3 4k i2v: 4K tier unverified — assume 2× pro (over-estimate = safe side)
 */
export const KLING_RATE_USD_PER_SEC: Record<KlingKey, { audioOff: number; audioOn: number }> = {
  "i2v-pro":    { audioOff: 0.112, audioOn: 0.168 },
  "i2v-std":    { audioOff: 0.084, audioOn: 0.126 },
  "t2v-pro":    { audioOff: 0.112, audioOn: 0.168 },
  "t2v-master": { audioOff: 0.28,  audioOn: 0.28 },
  "i2v-4k":     { audioOff: 0.224, audioOn: 0.336 },
};

/** Estimated USD cost of one Kling clip — drives dry-run estimates and the spend gate. */
export function estimateKlingCost(model: KlingKey, seconds: number, generateAudio = true): number {
  const rate = KLING_RATE_USD_PER_SEC[model];
  return seconds * (generateAudio ? rate.audioOn : rate.audioOff);
}

/** Convert a local image file to a base64 data URI accepted by fal start_image_url. */
function toDataUri(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return `data:${mimeForImage(filePath)};base64,${bytes.toString("base64")}`;
}

export interface KlingOptions {
  prompt: string;
  /** Local path → i2v seed frame. Triggers i2v mode; aspect inferred from image. */
  imagePath?: string;
  /** Local path → last-frame lock (i2v only). */
  endImagePath?: string;
  /** "5" or "10" seconds. Default "5". */
  duration?: "5" | "10";
  /** t2v only — i2v ignores this and infers from start_image_url dimensions. */
  aspect?: "16:9" | "9:16" | "1:1";
  negative?: string;
  /** Whether Kling should generate native audio. Default true. */
  generateAudio?: boolean;
  outDir: string;
  name?: string;
  model?: KlingKey;
  /** Overrides FAL_KEY env var. */
  apiKey?: string;
  /** Wall-clock cap on the fal job. Default 15 min — a hung job otherwise stalls a batch forever. */
  maxWaitMs?: number;
  /** Called each time fal.ai emits a queue update. */
  onTick?: (sec: number) => void;
}

export interface KlingResult {
  file: string;
  bytes: number;
  seconds: number;
  model: KlingKey;
  /** Original fal.ai video URL (expires after ~1h). */
  videoUrl: string;
  /** Estimated USD billed for this clip. */
  estimatedCostUsd: number;
}

export async function generateKlingVideo(opts: KlingOptions): Promise<KlingResult> {
  configureFal(opts.apiKey);

  const isI2V = !!opts.imagePath;
  // Default to the right model for the mode if caller didn't specify.
  const modelKey = opts.model ?? (isI2V ? "i2v-pro" : "t2v-master");
  const modelId = KLING_MODELS[modelKey];
  const duration = opts.duration ?? "5";
  const generateAudio = opts.generateAudio ?? true;

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    duration,
    negative_prompt: opts.negative ?? "blur, distort, low quality, watermark",
    generate_audio: generateAudio,
  };

  if (isI2V) {
    input.start_image_url = toDataUri(opts.imagePath!);
    if (opts.endImagePath) input.end_image_url = toDataUri(opts.endImagePath);
    // No aspect_ratio for i2v — inferred from start_image_url dimensions.
  } else {
    input.aspect_ratio = opts.aspect ?? "16:9";
  }

  const start = Date.now();
  const maxWait = opts.maxWaitMs ?? 15 * 60_000;

  // Submit under the shared retry policy (transient 429 → backoff), racing the
  // subscribe against a wall-clock deadline so a hung job can't stall a batch. A
  // timed-out job may still finish + bill server-side — recover the URL from
  // fal.ai request history rather than assuming it was lost.
  const result = await withRetry(
    () => {
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Kling job exceeded ${Math.round(maxWait / 60000)} min wall clock — check fal.ai request history before re-running (the job may still complete and bill)`)),
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
    { label: `kling ${modelKey}` }
  );

  const data = result.data as { video: { url: string; file_size?: number } };
  const videoUrl = data?.video?.url;
  if (!videoUrl) throw new Error("No video URL in Kling response (possible safety block)");

  // Download the MP4 to disk. Generation is ALREADY PAID at this point, so the
  // download retries independently; on final failure the URL (valid ~1h) is
  // persisted to _paid-recovery-urls.txt so the paid output is never lost.
  fs.mkdirSync(opts.outDir, { recursive: true });
  const slug = slugify(opts.name ?? opts.prompt);
  const filename = `${slug}-${modelKey}-${timestamp()}.mp4`;
  const full = path.join(opts.outDir, filename);

  let bytes: number;
  try {
    bytes = await downloadFile(videoUrl, full, { label: `kling ${slug}` });
  } catch (err) {
    const recovery = path.join(opts.outDir, "_paid-recovery-urls.txt");
    fs.appendFileSync(recovery, `${new Date().toISOString()}  ${slug}  ${videoUrl}\n`);
    throw new Error(
      `Kling render PAID but download failed — URL saved to ${recovery} (expires ~1h): ${err instanceof Error ? err.message : err}`
    );
  }

  return {
    file: full,
    bytes,
    seconds: (Date.now() - start) / 1000,
    model: modelKey,
    videoUrl,
    estimatedCostUsd: estimateKlingCost(modelKey, Number(duration), generateAudio),
  };
}
