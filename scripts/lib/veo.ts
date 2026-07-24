/**
 * scripts/lib/veo.ts
 *
 * Veo video generation core (text-to-video + image-to-video + first→last
 * interpolation + ASSET "ingredients"). Long-running: submit → poll the
 * operation → download the MP4. Accepts inputs as file PATHS (pnpm veo) or as
 * in-memory BUFFERS (the scene:* pipeline). Supabase-free.
 *
 * Tiers (verified live against the Generative Language API, 2026-07):
 *   quality   veo-3.1-generate-preview
 *   fast      veo-3.1-fast-generate-preview
 *   lite      veo-3.1-lite-generate-preview
 *
 * NOTE (2026-07-02): the Veo 3.0 / 2.0 model IDs (veo-3.0-generate-001 etc.) now
 * 404 on this key ("not found for API version v1beta") — only the three 3.1 tiers
 * are exposed by ListModels. The veo3/veo3-fast/veo2 keys are kept as ALIASES onto
 * 3.1 fast so older callers don't break, but they no longer hit a distinct model.
 * The old "route face-seeded i2v to Veo 3.0 because 3.1 filters faces" workaround is
 * RETIRED: Veo 3.1 Fast now renders face-seeded image-to-video fine (verified live —
 * face-seeded try-on reels render without a safety block).
 */

import fs from "fs";
import path from "path";
import { slugify, timestamp, mimeForImage } from "./imagen.js";
import { getGoogleClient } from "./google.js";
import { withRetry, sleep } from "./retry.js";
import { VEO_MODELS, VEO_LABEL, type VeoKey } from "./model-ids.js";

// Model IDs + labels live in the central registry (scripts/lib/models.ts) so a
// version bump is a one-file edit; re-exported here for existing importers.
export { VEO_MODELS, VEO_LABEL };
export type { VeoKey };

export interface VeoFrame {
  buffer: Buffer;
  mimeType: string;
}

export interface VeoOptions {
  prompt: string;
  /** First-frame seed image PATH (image-to-video) — the strongest "use our ref" path. */
  imagePath?: string;
  /** First-frame seed as an in-memory buffer (alt to imagePath). */
  image?: VeoFrame;
  /** Last frame for first→last interpolation (Veo 3.1); pair with a first-frame image. */
  lastFrame?: VeoFrame;
  /** Veo 3.1 ASSET reference image PATHS (character/scene lock); used when no first-frame. */
  refPaths?: string[];
  /** ASSET reference image buffers (alt to refPaths) — "ingredients". */
  refs?: VeoFrame[];
  outDir: string;
  name?: string;
  model?: VeoKey;
  aspect?: string;
  resolution?: string;
  negative?: string;
  generateAudio?: boolean;
  personGeneration?: string;
  apiKey?: string;
  pollMs?: number;
  maxWaitMs?: number;
  onTick?: (sec: number) => void;
}

export interface VeoResult {
  file: string;
  bytes: number;
  seconds: number;
  model: VeoKey;
}

function toImageBytes(f: VeoFrame): { imageBytes: string; mimeType: string } {
  return { imageBytes: f.buffer.toString("base64"), mimeType: f.mimeType };
}

export async function generateVideo(opts: VeoOptions): Promise<VeoResult> {
  const key = opts.model ?? "fast";
  const model = VEO_MODELS[key];
  const ai = getGoogleClient(opts.apiKey);

  const image = opts.image
    ? toImageBytes(opts.image)
    : opts.imagePath
      ? { imageBytes: fs.readFileSync(opts.imagePath).toString("base64"), mimeType: mimeForImage(opts.imagePath) }
      : undefined;

  const config: Record<string, unknown> = {
    numberOfVideos: 1,
    aspectRatio: opts.aspect ?? "16:9",
  };
  // NOTE: do NOT force personGeneration — "ALLOW_ADULT" 400s on text-to-video.
  // Veo 3.1 Fast renders face-seeded image-to-video fine now; the old "route faces
  // to Veo 3.0" workaround is RETIRED (see the header note).
  if (opts.personGeneration) config.personGeneration = opts.personGeneration;
  if (opts.resolution) config.resolution = opts.resolution;
  if (opts.negative) config.negativePrompt = opts.negative;
  if (opts.generateAudio !== undefined) config.generateAudio = opts.generateAudio;
  // First→last interpolation (Veo 3.1): the last frame pairs with the first-frame image.
  if (opts.lastFrame) config.lastFrame = toImageBytes(opts.lastFrame);
  // Veo 3.1 ASSET reference images (only when not doing first-frame image-to-video).
  const refBufs: VeoFrame[] | undefined =
    opts.refs ?? opts.refPaths?.map((p) => ({ buffer: fs.readFileSync(p), mimeType: mimeForImage(p) }));
  if (!image && refBufs?.length) {
    config.referenceImages = refBufs.map((r) => ({
      image: toImageBytes(r),
      referenceType: "ASSET",
    }));
  } else if (image && refBufs?.length) {
    // Veo can't combine a first-frame seed with ASSET refs — surface it instead of
    // silently dropping the refs. For seed + character-lock together, use Seedance/Wan.
    console.warn(
      `  ⚠️  Veo ignores ${refBufs.length} ASSET ref(s) when a first-frame seed is set — ` +
        `use \`pnpm seedance --image … --end-image …\` or \`pnpm wan\` for seed + refs together.`
    );
  }

  // Submit under the shared policy: transient 429s back off + retry; the daily
  // free-tier cap / spend cap throw QuotaExhaustedError so batch loops can abort.
  let op = await withRetry(
    () =>
      ai.models.generateVideos({
        model,
        prompt: opts.prompt,
        ...(image ? { image } : {}),
        config,
      }),
    { label: `veo submit [${key}]` }
  );

  const start = Date.now();
  const poll = opts.pollMs ?? 12000;
  // Quality-tier 1080p renders can outlive the old 6-min cap; give them 10.
  const maxWait = opts.maxWaitMs ?? (key === "quality" ? 600000 : 360000);
  let pollFailures = 0;
  while (!op.done) {
    if (Date.now() - start > maxWait) throw new Error(`Veo timed out after ${Math.round(maxWait / 1000)}s`);
    await sleep(poll);
    opts.onTick?.((Date.now() - start) / 1000);
    try {
      op = await ai.operations.getVideosOperation({ operation: op });
      pollFailures = 0;
    } catch (err) {
      // Don't let one transient poll blip discard a multi-minute render.
      pollFailures += 1;
      if (pollFailures >= 3) throw err;
      console.warn(`  ⚠️  Veo poll failed (${pollFailures}/3) — ${err instanceof Error ? err.message : err}`);
    }
  }

  if (op.error) throw new Error(`Veo error: ${JSON.stringify(op.error)}`);
  const gv = op.response?.generatedVideos?.[0];
  const video = gv?.video;
  if (!video) throw new Error("No video in response (possibly safety-blocked)");

  fs.mkdirSync(opts.outDir, { recursive: true });
  const filename = `${slugify(opts.name ?? "veo")}-${key}-${timestamp()}.mp4`;
  const full = path.join(opts.outDir, filename);

  if (video.videoBytes) {
    fs.writeFileSync(full, Buffer.from(video.videoBytes, "base64"));
  } else {
    await ai.files.download({ file: video, downloadPath: full });
  }
  const bytes = fs.existsSync(full) ? fs.statSync(full).size : 0;
  if (!bytes) throw new Error("Downloaded video is empty");
  return { file: full, bytes, seconds: (Date.now() - start) / 1000, model: key };
}
