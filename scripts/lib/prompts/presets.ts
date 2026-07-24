/**
 * scripts/lib/prompts/presets.ts
 *
 * Reusable negative-prompt + consistency clause + quality-suffix libraries.
 * Both the Seedance and Nano-Banana-Pro prompt corpora prove these clauses are
 * load-bearing — a trailing negative list and a verbatim consistency clause are
 * what keep multi-shot output clean. Centralized so every builder shares them.
 */

export const NEGATIVE_PRESETS = {
  image:
    "blurry, low resolution, deformed hands, extra fingers, watermark, signature, " +
    "logos, readable UI text, fake portrait-mode blur, over-smoothed skin, " +
    "plastic look, distorted proportions, asymmetrical face",
  video:
    "no distortion, no stretching, no warping, no jump cuts, no flicker, " +
    "no camera shake, no text, no subtitles, no watermark, no extra limbs, " +
    "no morphing faces, no duplicated characters",
  product:
    "wrong logo, misspelled brand text, distorted packaging, melted edges, " +
    "color shift on the product, harsh colored light cast on the product, " +
    "watermark, extra duplicate products",
} as const;
export type NegativePreset = keyof typeof NEGATIVE_PRESETS;

/**
 * Append to any multi-shot / recurring-character work to lock identity.
 * (BigBanana "asset constraint" + Seedance character-consistency clause.)
 */
export const CONSISTENCY_CLAUSE =
  "Maintain strict character consistency: identical face, hairstyle, skin tone, " +
  "outfit, and proportions throughout the entire shot. Match the reference exactly. " +
  "No facial drift, no clothing changes, no deformation, no morphing.";

/**
 * Quality suffix auto-appended to image prompts (youtube-shorts-pipeline
 * prompt_suffix pattern) so style consistency does not depend on the model
 * remembering it. A brand profile's own suffix overrides these.
 */
export const QUALITY_SUFFIX = {
  photoreal:
    "photorealistic, cinematic lighting, ultra-detailed, sharp focus, high dynamic range",
  illustration:
    "clean vector-quality linework, bold flat color, crisp edges, professional illustration",
  cinematic:
    "cinematic film still, shallow depth of field, volumetric light, filmic color grade, 4K detail",
} as const;
export type QualityStyle = keyof typeof QUALITY_SUFFIX;

/** Resolve a preset key to its clause, or pass an arbitrary string through. */
export function resolveNegative(neg: string | undefined): string | undefined {
  if (!neg) return undefined;
  return (NEGATIVE_PRESETS as Record<string, string>)[neg] ?? neg;
}
