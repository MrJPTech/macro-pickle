/**
 * Reusable reference-stage style presets.
 *
 * Adapted from the per-niche profile idea in rushindrasinha/youtube-shorts-pipeline
 * (Verticals) — instead of hand-writing style + negative prompt + aspect every
 * time, pick a preset that prefills sensible art direction. Apply with:
 *   pnpm scene:new <slug> --preset streetwear-product
 */

export interface StylePreset {
  style: string;
  negativePrompt: string;
  aspectRatio: string;
}

export const STYLE_PRESETS: Record<string, StylePreset> = {
  "streetwear-product": {
    style:
      "high-end streetwear product photography, bold graphic art direction, glossy laminate, saturated brand colors",
    negativePrompt:
      "blurry, low quality, distorted logos, garbled text, watermark, cluttered background",
    aspectRatio: "1:1",
  },
  "editorial-portrait": {
    style:
      "editorial portrait photography, soft Rembrandt lighting, clean studio backdrop, neutral white balance",
    negativePrompt:
      "harsh shadows, oversaturated skin, distorted face, extra fingers, plastic skin",
    aspectRatio: "4:3",
  },
  "cinematic-scene": {
    style:
      "cinematic establishing shot, anamorphic framing, volumetric light, teal-and-orange grade, 35mm film grain",
    negativePrompt:
      "flat lighting, snapshot look, low detail, washed out, text overlays",
    aspectRatio: "16:9",
  },
  "character-mascot": {
    style:
      "stylized mascot character design, bold clean outlines, even legible lighting for character-lock, plain backdrop",
    negativePrompt:
      "inconsistent proportions, dramatic shadows hiding features, busy background, multiple characters",
    aspectRatio: "1:1",
  },
  "social-vertical": {
    style:
      "mobile-first vertical composition, punchy contrast, clear focal subject with headroom",
    negativePrompt: "blurry, low quality, busy edges, important detail cropped",
    aspectRatio: "9:16",
  },
};

export function getPreset(name: string): StylePreset | undefined {
  return STYLE_PRESETS[name];
}

export function presetNames(): string[] {
  return Object.keys(STYLE_PRESETS);
}
