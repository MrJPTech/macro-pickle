/**
 * scripts/lib/wan.ts
 *
 * Wan 2.7 video generation via fal.ai. #3 on the Artificial Analysis Video Arena
 * (2026-07) and the best price/quality of the frontier tier: $0.10/s @720p,
 * $0.15/s @1080p, first+last keyframes, and a native v2v EDIT endpoint.
 * Supabase-free. fal.subscribe() polls internally; raced against a deadline and
 * wrapped in withRetry (transient 429 → backoff).
 *
 * Modes / slugs (verified fal.ai, 2026-07-21):
 *   t2v   fal-ai/wan/v2.7/text-to-video
 *   i2v   fal-ai/wan/v2.7/image-to-video   ← first + last frame (image_url + end_image_url)
 *   edit  fal-ai/wan/v2.7/edit-video       ← v2v: restyle / scene mod / element swap from video_url
 *
 * Confirmed input fields (OpenAPI): prompt, image_url, end_image_url, video_url,
 * audio_url, resolution ("720p"|"1080p"), duration (2–15), negative_prompt,
 * seed, enable_prompt_expansion, enable_safety_checker.
 *
 * Env:  FAL_KEY  (set in .env.local). PAID per second — estimate before batching.
 */

import fs from "fs";
import path from "path";
import { fal } from "@fal-ai/client";
import { slugify, timestamp, mimeForImage } from "./imagen.js";
import { configureFal, downloadFile } from "./fal.js";
import { withRetry } from "./retry.js";
import { WAN_MODELS, type WanKey } from "./model-ids.js";

export type WanResolution = "720p" | "1080p";

/** $/second of OUTPUT — verified on the fal Wan 2.7 pages 2026-07-21. */
export const WAN_RATE_USD_PER_SEC: Record<WanResolution, number> = {
  "720p": 0.10,
  "1080p": 0.15,
};

/** Estimated USD for one Wan clip. */
export function estimateWanCost(seconds: number, resolution: WanResolution): number {
  return seconds * WAN_RATE_USD_PER_SEC[resolution];
}

function mimeForMedia(file: string): string {
  const e = path.extname(file).toLowerCase();
  if (e === ".mp4") return "video/mp4";
  if (e === ".mov") return "video/quicktime";
  if (e === ".webm") return "video/webm";
  if (e === ".wav") return "audio/wav";
  if (e === ".mp3") return "audio/mpeg";
  if (e === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

/** Local image → base64 data URI (small; used for start/end frames). */
function imageToDataUri(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return `data:${mimeForImage(filePath)};base64,${bytes.toString("base64")}`;
}

/** Local video/audio → data URI, warning when the payload is large. Prefer a hosted URL for big media. */
function mediaToDataUri(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  if (bytes.length > 90 * 1024 * 1024) {
    console.warn(
      `  ⚠️  ${path.basename(filePath)} is ${Math.round(bytes.length / 1048576)}MB — a base64 data URI this large may be rejected; pass a hosted URL instead.`
    );
  }
  return `data:${mimeForMedia(filePath)};base64,${bytes.toString("base64")}`;
}

export interface WanOptions {
  prompt: string;
  /** i2v FIRST frame — local path (→ data URI). */
  imagePath?: string;
  /** i2v FIRST frame — hosted URL (alt to imagePath). */
  imageUrl?: string;
  /** i2v LAST frame — local path. Pairs with imagePath for first→last interpolation. */
  endImagePath?: string;
  /** i2v LAST frame — hosted URL. */
  endImageUrl?: string;
  /** v2v EDIT source clip — hosted URL (preferred for video). */
  videoUrl?: string;
  /** v2v EDIT source clip — local path (→ data URI; large files warned). */
  videoPath?: string;
  /** Drive-audio track — hosted URL. */
  audioUrl?: string;
  /** Drive-audio track — local path. */
  audioPath?: string;
  /** "720p" | "1080p". Default "1080p". */
  resolution?: WanResolution;
  /** Seconds, 2–15. Default 5. */
  duration?: number;
  negative?: string;
  seed?: number;
  /** fal `enable_prompt_expansion`. Default true. */
  enablePromptExpansion?: boolean;
  outDir: string;
  name?: string;
  /** Force a mode; default inferred: video → edit, image → i2v, else t2v. */
  model?: WanKey;
  apiKey?: string;
  maxWaitMs?: number;
  onTick?: (sec: number) => void;
}

export interface WanResult {
  file: string;
  bytes: number;
  seconds: number;
  model: WanKey;
  videoUrl: string;
  estimatedCostUsd: number;
}

export async function generateWanVideo(opts: WanOptions): Promise<WanResult> {
  configureFal(opts.apiKey);

  const hasVideo = !!(opts.videoUrl || opts.videoPath);
  const hasImage = !!(opts.imagePath || opts.imageUrl);
  const modelKey: WanKey = opts.model ?? (hasVideo ? "edit" : hasImage ? "i2v" : "t2v");
  if (modelKey === "ref") {
    throw new Error(
      "Wan reference-to-video (model 'ref') isn't wired yet — use 'i2v' (first+last), 't2v', or 'edit'. Its reference-array fields need confirming first."
    );
  }
  const modelId = WAN_MODELS[modelKey];
  const resolution = opts.resolution ?? "1080p";
  const duration = opts.duration ?? 5;

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    resolution,
    duration,
    enable_prompt_expansion: opts.enablePromptExpansion ?? true,
  };
  if (opts.negative) input.negative_prompt = opts.negative;
  if (opts.seed !== undefined) input.seed = opts.seed;

  const startImg = opts.imageUrl ?? (opts.imagePath ? imageToDataUri(opts.imagePath) : undefined);
  const endImg = opts.endImageUrl ?? (opts.endImagePath ? imageToDataUri(opts.endImagePath) : undefined);
  const srcVideo = opts.videoUrl ?? (opts.videoPath ? mediaToDataUri(opts.videoPath) : undefined);
  const audio = opts.audioUrl ?? (opts.audioPath ? mediaToDataUri(opts.audioPath) : undefined);

  if (modelKey === "edit") {
    if (!srcVideo) throw new Error("Wan edit (v2v) needs a videoUrl or videoPath");
    input.video_url = srcVideo;
    // A reference image is optional for edit ("recreate with this reference").
    if (startImg) input.image_url = startImg;
  } else if (modelKey === "i2v") {
    if (!startImg) throw new Error("Wan i2v needs an imagePath or imageUrl (first frame)");
    input.image_url = startImg;
    if (endImg) input.end_image_url = endImg; // first→last keyframe pair
  }
  if (audio) input.audio_url = audio;

  const start = Date.now();
  const maxWait = opts.maxWaitMs ?? 15 * 60_000;

  const result = await withRetry(
    () => {
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(
          () => reject(new Error(`Wan job exceeded ${Math.round(maxWait / 60000)} min wall clock — check fal.ai request history before re-running (the job may still complete and bill)`)),
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
    { label: `wan ${modelKey}` }
  );

  const data = (result as { data?: { video?: { url?: string } } }).data;
  const videoUrl = data?.video?.url;
  if (!videoUrl) throw new Error("No video URL in Wan response (possible safety block)");

  fs.mkdirSync(opts.outDir, { recursive: true });
  const slug = slugify(opts.name ?? opts.prompt);
  const filename = `${slug}-wan-${modelKey}-${timestamp()}.mp4`;
  const full = path.join(opts.outDir, filename);

  let bytes: number;
  try {
    bytes = await downloadFile(videoUrl, full, { label: `wan ${slug}` });
  } catch (err) {
    const recovery = path.join(opts.outDir, "_paid-recovery-urls.txt");
    fs.appendFileSync(recovery, `${new Date().toISOString()}  ${slug}  ${videoUrl}\n`);
    throw new Error(
      `Wan render PAID but download failed — URL saved to ${recovery} (expires ~1h): ${err instanceof Error ? err.message : err}`
    );
  }

  return {
    file: full,
    bytes,
    seconds: (Date.now() - start) / 1000,
    model: modelKey,
    videoUrl,
    estimatedCostUsd: estimateWanCost(duration, resolution),
  };
}
