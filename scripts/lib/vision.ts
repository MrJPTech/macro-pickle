/**
 * scripts/lib/vision.ts
 *
 * Gemini-vision understanding (image/video -> structured text). The understanding
 * rail beside nano-banana.ts (image OUTPUT): product OCR + in-use scene rec,
 * reference-video mirroring, and multi-frame grounding for the scene:* pipeline.
 * Fence-strip -> JSON.parse on the model text. Supabase-free.
 */
import fs from "fs";
import path from "path";
import { runPaddleOcr } from "./paddleocr.js";
import { mimeForImage } from "./imagen.js";
import { getGoogleClient } from "./google.js";

// gemini-2.0-flash is deprecated (404 NOT_FOUND). Try current vision-capable flash
// models in order; use the first that responds. Robust to further deprecations.
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-3-flash"];

export interface ProductDescription {
  /** Any text / Chinese / watermark / logo visible in the image (to REMOVE). "" if none. */
  detected_text: string;
  /** What the product actually is, plainly. */
  product_type: string;
  /** Key materials / finish / colors. */
  materials: string;
  /** A single specific real-world IN-USE scene for the brand. One vivid sentence. */
  suggested_scene: string;
  /** Who uses it and how, briefly. */
  usage_context: string;

  /** ---- Optional: populated only when PaddleOCR augmentation is enabled ---- */
  /** Which OCR engine sharpened this (e.g. "paddleocr"); absent when Gemini-only. */
  ocr_engine?: string;
  /** PaddleOCR high-recall text lines (small / CJK), in detection order. */
  ocr_texts?: string[];
  /** Per-line confidence scores (parallel to ocr_texts). */
  ocr_scores?: number[];
  /** Per-line geometry: each entry is a polygon of [x, y] points (for masking). */
  ocr_boxes?: number[][][];
  /** Set if PaddleOCR was requested but failed (non-fatal; Gemini result still returned). */
  ocr_error?: string;
}

export interface DescribeOptions {
  imagePath: string;
  title?: string;
  description?: string;
  /** Brand framing for the scene, e.g. "Quiet Desk Co. (premium desk objects)". */
  brand?: string;
  apiKey?: string;
  /** Opt-in: also run the local PaddleOCR sidecar to sharpen OCR (default off). */
  paddleOcr?: boolean;
  /** PaddleOCR lang id when paddleOcr is on. Default "ch" (Chinese + English). */
  paddleLang?: string;
  /** Python interpreter for the PaddleOCR sidecar (else MACRO_PICKLE_PYTHON, else "python"). */
  python?: string;
}

/** Describe a product from its photo + known title/description -> OCR + scene recommendation. */
export async function describeProduct(opts: DescribeOptions): Promise<ProductDescription> {
  if (!fs.existsSync(opts.imagePath)) throw new Error(`image not found: ${opts.imagePath}`);

  const ai = getGoogleClient(opts.apiKey);
  const imagePart = {
    inlineData: {
      mimeType: mimeForImage(opts.imagePath),
      data: fs.readFileSync(opts.imagePath).toString("base64"),
    },
  };

  const brand = opts.brand ?? "an outdoor / trail / camping gear brand";
  const known = [
    opts.title ? `Known title: ${opts.title}` : "",
    opts.description ? `Known description: ${opts.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are a product photography art director for ${brand}. Study the product in the reference image${known ? ", plus the known info below" : ""}.
${known}

Return ONLY valid JSON (no markdown code fences) with exactly these keys:
- "detected_text": any text, Chinese/foreign characters, watermark, logo, brand mark, sticker, or price tag visible in the image (short verbatim, or "" if none) — this is what must be REMOVED from a clean recreation.
- "product_type": what the product actually is, plainly.
- "materials": key materials / finish / colors.
- "suggested_scene": ONE specific, realistic scene showing THIS product being USED in its correct setting/environment for ${brand} (e.g. "a hiker sitting on the folding stool beside a morning campfire"). One vivid sentence, no text/branding.
- "usage_context": who uses it and how, briefly.`;

  let text = "{}";
  let lastErr: unknown = new Error("no vision model attempted");
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [imagePart, { text: prompt }] }],
      });
      text = res.text?.trim() ?? "{}";
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const s = String((e as { message?: string })?.message ?? e);
      // 404 / not-found / deprecated -> try the next model; quota/other -> bubble up
      if (!/404|not[ _]?found|unsupported|deprecat/i.test(s)) throw e;
    }
  }
  if (lastErr) throw new Error(`vision describe failed (all models): ${(lastErr as Error).message}`);

  const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  const desc = JSON.parse(cleaned) as ProductDescription;

  // Opt-in: sharpen with the local PaddleOCR sidecar. Non-fatal — on any failure we
  // keep the Gemini-only result. detected_text stays PURE Gemini (it drives the regen
  // negative); PaddleOCR's high-recall read is exposed separately in the ocr_* fields.
  if (opts.paddleOcr) {
    try {
      const ocr = await runPaddleOcr({
        imagePath: opts.imagePath,
        lang: opts.paddleLang,
        python: opts.python,
      });
      desc.ocr_engine = ocr.engine;
      desc.ocr_texts = ocr.texts;
      desc.ocr_scores = ocr.scores;
      desc.ocr_boxes = ocr.polys;
    } catch (e) {
      desc.ocr_error = e instanceof Error ? e.message : String(e);
      console.error(`⚠️  PaddleOCR augmentation skipped: ${desc.ocr_error}`);
    }
  }

  return desc;
}

// --------------------------------------------------------------------------- video
function videoMimeFor(file: string): string {
  const e = path.extname(file).toLowerCase();
  if (e === ".webm") return "video/webm";
  if (e === ".mov") return "video/quicktime";
  if (e === ".m4v") return "video/x-m4v";
  if (e === ".avi") return "video/x-msvideo";
  return "video/mp4";
}

/** Structured read of a reference/competitor short, mapped onto our UGC vocabulary. */
export interface ReferenceVideoAnalysis {
  /** The first-3-seconds hook, described. */
  hook: string;
  /** Closest UGC_FORMATS key (faceless-finds, unboxing, problem-solution, demo, before-after, listicle, tutorial). */
  format: string;
  /** Cut rhythm / energy / grade. */
  pacing: string;
  /** 2–5 observed beats, in order. */
  shot_list: string[];
  /** On-screen caption/text overlays seen (short, near-verbatim). */
  on_screen_text: string;
  /** The call to action. */
  cta: string;
  /** Music / voiceover / SFX character. */
  audio: string;
  /** One sentence: how to adapt this structure for our own product. */
  mirror_brief_idea: string;
}

export interface AnalyzeVideoOptions {
  videoPath: string;
  /** Optional steer, e.g. "adapt this for a collapsible water bucket". */
  goal?: string;
  apiKey?: string;
}

const MAX_INLINE_VIDEO_BYTES = 18 * 1024 * 1024; // Gemini inline request budget (~20MB)

/**
 * Watch a short reference video and extract its UGC structure (hook, format, pacing,
 * shot list, captions, CTA) so it can be MIRRORED into one of our briefs. Short clips
 * only — inline upload caps near 20MB; trim/compress longer footage first (or route it
 * through the opus-clip-automation skill). Supabase-free.
 */
export async function describeReferenceVideo(
  opts: AnalyzeVideoOptions
): Promise<ReferenceVideoAnalysis> {
  if (!fs.existsSync(opts.videoPath)) throw new Error(`video not found: ${opts.videoPath}`);
  const bytes = fs.statSync(opts.videoPath).size;
  if (bytes > MAX_INLINE_VIDEO_BYTES) {
    throw new Error(
      `video is ${(bytes / 1024 / 1024).toFixed(1)}MB — too large for inline analysis (~18MB cap). ` +
        `Trim/compress the clip first, or use the opus-clip-automation skill for long-form.`
    );
  }

  const ai = getGoogleClient(opts.apiKey);
  const videoPart = {
    inlineData: {
      mimeType: videoMimeFor(opts.videoPath),
      data: fs.readFileSync(opts.videoPath).toString("base64"),
    },
  };

  const goal = opts.goal ? `\nWe want to: ${opts.goal}` : "";
  const prompt = `You are a short-form UGC strategist. Watch this reference video and reverse-engineer its SELLING structure so we can mirror the form (not copy the content) for our own product.${goal}

Return ONLY valid JSON (no markdown code fences) with exactly these keys:
- "hook": what happens in the first 3 seconds (the scroll-stopper).
- "format": the closest match from this set — faceless-finds, unboxing, problem-solution, demo, before-after, listicle, tutorial.
- "pacing": cut rhythm, energy, and color grade.
- "shot_list": an array of 2-5 short strings, the beats in order.
- "on_screen_text": the on-screen captions / text overlays you see (short, near-verbatim).
- "cta": the call to action.
- "audio": music / voiceover / SFX character.
- "mirror_brief_idea": ONE sentence on how to adapt this structure for our product.`;

  let text = "{}";
  let lastErr: unknown = new Error("no vision model attempted");
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [videoPart, { text: prompt }] }],
      });
      text = res.text?.trim() ?? "{}";
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const s = String((e as { message?: string })?.message ?? e);
      if (!/404|not[ _]?found|unsupported|deprecat/i.test(s)) throw e;
    }
  }
  if (lastErr) throw new Error(`reference-video analysis failed (all models): ${(lastErr as Error).message}`);

  const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(cleaned) as ReferenceVideoAnalysis;
}

// --------------------------------------------------------------------------- frame grounding
export interface FrameInput {
  buffer: Buffer;
  mimeType: string;
}

export interface FrameGrounding {
  /** One-paragraph description of the scene/subject. */
  caption: string;
  /** Distinctive subject attributes to preserve for consistency. */
  subjects: string[];
  /** Any legible text / logos / signage in the frames. */
  detectedText: string[];
  /** Dominant colors. */
  palette: string[];
  /** Lighting / mood. */
  lighting: string;
  /** Dense one-line grounding string for the prompt enhancer / video prompt. */
  groundingSummary: string;
  model: string;
}

/**
 * Multi-frame grounding — the image -> understanding -> prompt feedback loop. Feeds
 * curated reference frames back through Gemini vision to caption + extract subjects /
 * on-image text / palette / lighting, plus a dense one-line grounding string, so a
 * generated video stays on-subject and on-brand. Shared by the scene:* pipeline
 * (analyze + video grounding). Supabase-free.
 */
export async function groundFrames(
  images: FrameInput[],
  opts: { apiKey?: string } = {}
): Promise<FrameGrounding> {
  const ai = getGoogleClient(opts.apiKey);

  const instruction = `You are a visual analyst preparing reference frames for AI video generation. Examine the image(s) and extract the details needed to keep a generated video consistent with them.

Return ONLY valid JSON (no markdown code fences) with exactly these keys:
- "caption": one paragraph describing the scene and subject.
- "subjects": array of distinctive attributes to preserve for consistency.
- "detectedText": array of any legible text / logos / signage.
- "palette": array of dominant colors (names or hex).
- "lighting": lighting and mood.
- "groundingSummary": one dense line summarizing subject + look, for use in a prompt.`;

  const parts = [
    { text: instruction },
    ...images.map((img) => ({
      inlineData: { mimeType: img.mimeType, data: img.buffer.toString("base64") },
    })),
  ];

  let text = "{}";
  let usedModel = MODELS[0]!;
  let lastErr: unknown = new Error("no vision model attempted");
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: [{ role: "user", parts }] });
      text = res.text?.trim() ?? "{}";
      usedModel = model;
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const s = String((e as { message?: string })?.message ?? e);
      if (!/404|not[ _]?found|unsupported|deprecat/i.test(s)) throw e;
    }
  }
  if (lastErr) throw new Error(`frame grounding failed (all models): ${(lastErr as Error).message}`);

  const cleaned = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  let parsed: Partial<FrameGrounding> = {};
  try {
    parsed = JSON.parse(cleaned) as Partial<FrameGrounding>;
  } catch {
    // Never silent: an unparseable reply means empty grounding flows into the
    // video prompt — surface it so the operator knows the render is unguided.
    console.warn(
      `  ⚠️  groundFrames: ${usedModel} returned non-JSON — proceeding with EMPTY grounding. Raw reply: ${cleaned.slice(0, 200)}`
    );
  }
  return {
    caption: parsed.caption ?? "",
    subjects: parsed.subjects ?? [],
    detectedText: parsed.detectedText ?? [],
    palette: parsed.palette ?? [],
    lighting: parsed.lighting ?? "",
    groundingSummary: parsed.groundingSummary ?? parsed.caption ?? "",
    model: usedModel,
  };
}
