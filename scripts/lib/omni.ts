/**
 * scripts/lib/omni.ts
 *
 * Gemini Omni Flash video core — generation + conversational EDITING via the
 * Interactions API (@google/genai ≥2.x). This is the "manipulate an existing
 * video with natural language" rail: upload a reference clip through the Files
 * API, describe the change, get an edited MP4 back. Multi-turn refinement
 * chains through previous_interaction_id.
 *
 * Model: gemini-omni-flash-preview  —  PAID TIER ONLY (no free tier, unlike
 * Imagen/Gemini). Billing must be enabled on the GOOGLE_API_KEY project or
 * every call 429s. Effective cost ≈ $0.10 per second of 720p output video.
 *
 * Known API limits (2026-07): input video refs ≤3s misprocess, one video ref
 * max, no audio refs, no negative prompts / temperature / system instructions,
 * video editing of uploads unavailable in EEA/CH/UK.
 */

import fs from "fs";
import path from "path";
import { slugify, timestamp, mimeForImage } from "./imagen.js";
import { getGoogleClient } from "./google.js";
import { withRetry } from "./retry.js";

// Centralized in scripts/lib/models.ts; re-exported here for existing importers.
import { OMNI_MODEL } from "./model-ids.js";
export { OMNI_MODEL };

/** Task modes accepted by generation_config.video_config.task. */
export type OmniTask = "text_to_video" | "image_to_video" | "reference_to_video" | "edit";

// Pricing (ai.google.dev/gemini-api/docs/pricing, 2026-07): input $1.50/1M tok,
// video output $17.50/1M tok; video = 5792 tok/s, image = 2040 tok.
const TOK_PER_VIDEO_SEC = 5792;
const TOK_PER_IMAGE = 2040;
const USD_PER_M_INPUT = 1.5;
const USD_PER_M_VIDEO_OUT = 17.5;

export interface OmniCostEstimate {
  usd: number;
  breakdown: string;
}

/** Rough spend estimate for one interaction (output dominates at ~$0.10/s). */
export function estimateOmniCost(opts: {
  outputSeconds?: number;
  inputVideoSeconds?: number;
  imageCount?: number;
}): OmniCostEstimate {
  const outSec = opts.outputSeconds ?? 8;
  const out = (outSec * TOK_PER_VIDEO_SEC * USD_PER_M_VIDEO_OUT) / 1e6;
  const inVideo = ((opts.inputVideoSeconds ?? 0) * TOK_PER_VIDEO_SEC * USD_PER_M_INPUT) / 1e6;
  const inImages = ((opts.imageCount ?? 0) * TOK_PER_IMAGE * USD_PER_M_INPUT) / 1e6;
  const usd = out + inVideo + inImages;
  const parts = [`output ${outSec}s ≈ $${out.toFixed(2)}`];
  if (inVideo > 0) parts.push(`input video ≈ $${inVideo.toFixed(3)}`);
  if (inImages > 0) parts.push(`ref images ≈ $${inImages.toFixed(3)}`);
  return { usd, breakdown: parts.join(" + ") };
}

export interface OmniOptions {
  /** The generation or edit instruction. */
  prompt: string;
  /** Reference/source VIDEO path — uploaded via the Files API (task: edit). */
  videoPath?: string;
  /** Reference image paths (subject/product lock or i2v seed). */
  imagePaths?: string[];
  /** Reference images as in-memory buffers (the scene:* pipeline path). */
  images?: Array<{ buffer: Buffer; mimeType: string }>;
  /** Chain a conversational edit onto a prior interaction. */
  previousInteractionId?: string;
  /** Override the task mode; otherwise the model infers it. */
  task?: OmniTask;
  aspect?: "16:9" | "9:16";
  /** Output duration hint, e.g. "8s" (API accepts a string; optional). */
  duration?: string;
  outDir: string;
  name?: string;
  apiKey?: string;
  onStatus?: (msg: string) => void;
}

export interface OmniResult {
  file: string;
  bytes: number;
  seconds: number;
  /** Feed back as previousInteractionId for the next conversational edit. */
  interactionId: string;
}

/** Upload a source video through the Files API and wait until it's ACTIVE. */
async function uploadVideo(
  ai: ReturnType<typeof getGoogleClient>,
  videoPath: string,
  onStatus?: (msg: string) => void
): Promise<{ uri: string; mimeType: string }> {
  onStatus?.(`uploading ${path.basename(videoPath)} via Files API`);
  let file = await ai.files.upload({ file: videoPath });
  while (file.state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 5000));
    file = await ai.files.get({ name: file.name! });
    onStatus?.("waiting for video processing…");
  }
  if (file.state === "FAILED" || !file.uri) {
    throw new Error(`Files API upload failed for ${videoPath} (state: ${file.state})`);
  }
  return { uri: file.uri, mimeType: file.mimeType ?? "video/mp4" };
}

/**
 * Run one Omni Flash interaction (generate / edit) and save the MP4 locally.
 * Inputs are assembled as typed content blocks: text + optional image refs +
 * optional uploaded source video.
 */
export async function generateOmniVideo(opts: OmniOptions): Promise<OmniResult> {
  const ai = getGoogleClient(opts.apiKey);
  const start = Date.now();

  type Block = Record<string, unknown>;
  const blocks: Block[] = [{ type: "text", text: opts.prompt }];

  for (const p of opts.imagePaths ?? []) {
    blocks.push({
      type: "image",
      data: fs.readFileSync(p).toString("base64"),
      mime_type: mimeForImage(p),
    });
  }
  for (const img of opts.images ?? []) {
    blocks.push({ type: "image", data: img.buffer.toString("base64"), mime_type: img.mimeType });
  }

  if (opts.videoPath) {
    const uploaded = await uploadVideo(ai, opts.videoPath, opts.onStatus);
    blocks.push({ type: "video", uri: uploaded.uri, mime_type: uploaded.mimeType });
  }

  const responseFormat: Record<string, unknown> = { type: "video" };
  if (opts.aspect) responseFormat.aspect_ratio = opts.aspect;
  if (opts.duration) responseFormat.duration = opts.duration;

  opts.onStatus?.(`interacting with ${OMNI_MODEL} (renders take a few minutes)…`);
  const interaction = await withRetry(
    () =>
      // The Interactions API surface is newer than the SDK's published param
      // types; the request shape follows ai.google.dev/gemini-api/docs/omni.
      (ai as unknown as {
        interactions: { create: (p: Record<string, unknown>) => Promise<Record<string, unknown>> };
      }).interactions.create({
        model: OMNI_MODEL,
        input: blocks.length === 1 ? opts.prompt : blocks,
        ...(opts.previousInteractionId
          ? { previous_interaction_id: opts.previousInteractionId }
          : {}),
        response_format: responseFormat,
        ...(opts.task ? { generation_config: { video_config: { task: opts.task } } } : {}),
      }),
    { label: "omni interact" }
  );

  const outputVideo = interaction.output_video as
    | { data?: string; uri?: string; mime_type?: string }
    | undefined;
  if (!outputVideo?.data && !outputVideo?.uri) {
    const text = (interaction.output_text as string | undefined)?.slice(0, 300);
    throw new Error(
      `No video in Omni Flash response (possibly safety-blocked).${text ? ` Model said: ${text}` : ""}`
    );
  }

  fs.mkdirSync(opts.outDir, { recursive: true });
  const filename = `${slugify(opts.name ?? "omni")}-${timestamp()}.mp4`;
  const full = path.join(opts.outDir, filename);

  if (outputVideo.data) {
    fs.writeFileSync(full, Buffer.from(outputVideo.data, "base64"));
  } else {
    // uri delivery (videos >4MB): fetch with the API key header.
    const key = opts.apiKey ?? process.env.GOOGLE_API_KEY!;
    const res = await fetch(outputVideo.uri!, { headers: { "x-goog-api-key": key } });
    if (!res.ok) throw new Error(`Omni video download failed: HTTP ${res.status}`);
    fs.writeFileSync(full, Buffer.from(await res.arrayBuffer()));
  }

  const bytes = fs.statSync(full).size;
  if (!bytes) throw new Error("Downloaded Omni video is empty");
  return {
    file: full,
    bytes,
    seconds: (Date.now() - start) / 1000,
    interactionId: String(interaction.id ?? ""),
  };
}
