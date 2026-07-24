import type { GoogleGenAI } from "@google/genai";
import { getGoogleClient } from "../google";
import {
  VIDEO_PROMPT_EXEMPLARS,
  PERFECT_PROMPT_FORMULA,
  KIND_GUIDANCE,
  exemplarsForKind,
  type PromptExemplar,
  type ImagePromptKind,
} from "./prompt-exemplars";

/**
 * Gemini-powered prompt enhancer.
 *
 * Replicates the Hunyuan PromptEnhancer (CVPR 2026) chain-of-thought rewriting
 * approach using Gemini directly — so it runs on your existing $0 Google Ultra
 * key with no model self-hosting. The model reasons about composition, lens,
 * lighting, style and detail, then emits a single dense prompt. Few-shot
 * exemplars (prompt-exemplars.ts) bias it toward house style.
 */

const DEFAULT_MODEL = process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";

export interface EnhanceImageOptions {
  /** "16:9", "9:16", etc. — woven into the prompt for composition awareness. */
  aspectRatio?: string;
  /** Art-direction hint, e.g. "graffiti streetwear", "editorial portrait". */
  style?: string;
  /** What to avoid (low quality, text artifacts, extra fingers, etc.). */
  negativePrompt?: string;
  /** Optional grounding from vision analysis of reference images. */
  visualContext?: string;
  /** Prompt category — selects exemplars + guidance (general/character/scene/keyframe). */
  kind?: ImagePromptKind;
}

export interface EnhanceVideoOptions {
  /** Whether reference images / ingredients will be supplied to the video model. */
  hasReferences?: boolean;
  aspectRatio?: string;
  negativePrompt?: string;
  /** Description of the curated reference frames, to keep the video on-subject. */
  visualContext?: string;
}

export interface EnhancementResult {
  prompt: string;
  reasoning: string;
  model: string;
}

function exemplarBlock(exemplars: PromptExemplar[]): string {
  return exemplars
    .map((e, i) => `Example ${i + 1}\nInput: ${e.raw}\nEnhanced: ${e.enhanced}`)
    .join("\n\n");
}

function parseJsonObject(text: string): { prompt?: string; reasoning?: string } {
  const cleaned = text
    .trim()
    .replace(/^```json?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(cleaned) as { prompt?: string; reasoning?: string };
  } catch {
    console.warn(
      `  ⚠️  prompt enhancer returned non-JSON — falling back to the raw prompt. Reply: ${cleaned.slice(0, 160)}`
    );
    return {};
  }
}

export class PromptEnhancer {
  private client: GoogleGenAI;
  private model: string;

  constructor(apiKey?: string, model: string = DEFAULT_MODEL) {
    this.client = getGoogleClient(apiKey);
    this.model = model;
  }

  /** Rewrite a rough idea into a dense reference-frame (text-to-image) prompt. */
  async enhanceImagePrompt(
    raw: string,
    opts: EnhanceImageOptions = {}
  ): Promise<EnhancementResult> {
    const kind = opts.kind ?? "general";
    const constraints: string[] = [];
    if (opts.aspectRatio) constraints.push(`Target aspect ratio: ${opts.aspectRatio}.`);
    if (opts.style) constraints.push(`Art direction / style: ${opts.style}.`);
    if (opts.negativePrompt) constraints.push(`Avoid: ${opts.negativePrompt}.`);
    if (opts.visualContext)
      constraints.push(
        `Stay consistent with these reference visuals: ${opts.visualContext}.`
      );
    if (KIND_GUIDANCE[kind]) constraints.push(KIND_GUIDANCE[kind]);

    const prompt = `You are an expert text-to-image prompt engineer (in the style of the Hunyuan PromptEnhancer). Rewrite the user's rough idea into ONE dense, structured image-generation prompt optimized for Google's Nano Banana / Imagen models.

Reason step by step through this formula, then compose a single flowing prompt:
${PERFECT_PROMPT_FORMULA}
Preserve the user's original intent — never invent a different subject.

${constraints.length ? `Constraints:\n${constraints.join("\n")}\n` : ""}
Here are examples of the quality and density expected:

${exemplarBlock(exemplarsForKind(kind))}

User idea: ${raw}

Respond with ONLY valid JSON (no markdown fences):
{"reasoning": "<brief chain of thought>", "prompt": "<the single enhanced prompt>"}`;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    const parsed = parseJsonObject(response.text ?? "");
    return {
      prompt: parsed.prompt?.trim() || raw,
      reasoning: parsed.reasoning?.trim() ?? "",
      model: this.model,
    };
  }

  /** Rewrite a rough idea into a structured Veo video prompt. */
  async enhanceVideoPrompt(
    raw: string,
    opts: EnhanceVideoOptions = {}
  ): Promise<EnhancementResult> {
    const constraints: string[] = [];
    if (opts.hasReferences)
      constraints.push(
        "Reference images (ingredients / start & end frames) WILL be supplied — describe motion, camera and lighting, but do NOT re-describe the subject's fixed appearance in conflicting detail; keep it consistent with the references."
      );
    if (opts.aspectRatio) constraints.push(`Aspect ratio: ${opts.aspectRatio}.`);
    if (opts.negativePrompt) constraints.push(`Avoid: ${opts.negativePrompt}.`);
    if (opts.visualContext)
      constraints.push(`The curated reference frames show: ${opts.visualContext}.`);

    const prompt = `You are an expert Veo 3.1 video prompt engineer. Rewrite the user's rough idea into ONE cinematic video prompt using the structure: subject · action · scene/context · camera motion · lighting & mood · audio.

Reason briefly, then emit a single flowing prompt (not a bulleted list). Preserve the user's intent.

${constraints.length ? `Constraints:\n${constraints.join("\n")}\n` : ""}
Examples of expected quality:

${exemplarBlock(VIDEO_PROMPT_EXEMPLARS)}

User idea: ${raw}

Respond with ONLY valid JSON (no markdown fences):
{"reasoning": "<brief chain of thought>", "prompt": "<the single enhanced video prompt>"}`;

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
    });

    const parsed = parseJsonObject(response.text ?? "");
    return {
      prompt: parsed.prompt?.trim() || raw,
      reasoning: parsed.reasoning?.trim() ?? "",
      model: this.model,
    };
  }
}
