/**
 * scripts/lib/prompts/image.ts
 *
 * buildImagePrompt — renders an ImageBrief into a model-ready Nano Banana Pro /
 * Imagen prompt using the "Perfect Prompt" formula
 * (Subject + Action + Context + Composition + Lighting + Style), then folds in
 * a brand profile (style + palette + suffix + avoid-list) and a negative clause.
 */

import type { ImageBrief } from "./types.js";
import { QUALITY_SUFFIX, resolveNegative } from "./presets.js";
import { loadBrandProfile } from "./brand.js";

export interface BuiltImagePrompt {
  prompt: string;
  aspect: string;
}

export function buildImagePrompt(brief: ImageBrief): BuiltImagePrompt {
  const brand = brief.brand ? loadBrandProfile(brief.brand) : undefined;

  const parts: string[] = [brief.subject.trim()];
  if (brief.action) parts.push(brief.action.trim());
  if (brief.context) parts.push(brief.context.trim());
  if (brief.composition) parts.push(brief.composition.trim());
  if (brief.lighting) parts.push(brief.lighting.trim());

  const style = brief.style ?? brand?.style;
  if (style) parts.push(style.trim());
  if (brand?.palette?.length) {
    parts.push(`color palette: ${brand.palette.join(", ")}`);
  }

  // @-reference handles for multi-image fusion (Seedance/Nano convention).
  if (brief.refs?.length) parts.push(brief.refs.join("; "));

  // Exact on-image text — rendered in double quotes (Nano Banana text precision).
  if (brief.text) parts.push(`include the exact text "${brief.text}"`);

  // Quality/style suffix — brand suffix wins, else the chosen quality preset.
  const suffix =
    brand?.promptSuffix ?? (brief.quality ? QUALITY_SUFFIX[brief.quality] : undefined);
  if (suffix) parts.push(suffix.trim());

  let prompt = parts.filter(Boolean).join(". ").replace(/\.\s*\./g, ".");
  if (!prompt.endsWith(".")) prompt += ".";

  // Negatives: explicit preset/string + the brand's avoid list.
  const negPieces: string[] = [];
  const neg = resolveNegative(
    typeof brief.negative === "string" ? brief.negative : undefined
  );
  if (neg) negPieces.push(neg);
  if (brand?.avoid?.length) negPieces.push(brand.avoid.join(", "));
  if (negPieces.length) prompt += ` Avoid: ${negPieces.join(", ")}.`;

  const aspect = brief.aspect ?? brand?.aspect ?? "16:9";
  return { prompt, aspect };
}
