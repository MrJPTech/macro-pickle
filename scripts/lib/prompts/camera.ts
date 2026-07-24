/**
 * scripts/lib/prompts/camera.ts
 *
 * Controlled camera vocabulary + creative-intent presets, distilled from the
 * Seedance 2 "Director Brief" camera grammar and the cinema-director Intent
 * Mapping Table (LOGIC/repositories/{awesome-seedance-2-prompts,
 * Generative-Media-Skills}). Using a fixed vocabulary instead of free text
 * reduces drift in Veo 3.1 / Flow generations.
 */

export const SHOT_SIZES = [
  "extreme close-up",
  "close-up",
  "medium close-up",
  "medium shot",
  "medium wide shot",
  "wide shot",
  "extreme wide / establishing shot",
] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

export const CAMERA_MOVES = [
  "static / locked-off",
  "slow push-in (dolly in)",
  "slow pull-out (dolly out)",
  "pan left",
  "pan right",
  "tilt up",
  "tilt down",
  "tracking / follow",
  "360° orbit",
  "crane up",
  "crane down",
  "whip pan",
  "dolly zoom",
  "handheld",
  "FPV drone dive",
  "speed ramp",
] as const;
export type CameraMove = (typeof CAMERA_MOVES)[number];

export const LENSES = [
  "14mm ultra-wide",
  "24mm wide",
  "35mm",
  "50mm normal",
  "85mm portrait",
  "100mm macro",
  "anamorphic",
] as const;
export type Lens = (typeof LENSES)[number];

export interface IntentPreset {
  framing: string;
  move: string;
  lighting: string;
  lens: string;
  grade: string;
}

/**
 * Creative intent → technical direction. Seeds CAMERA + STYLE on a VideoBrief
 * when the caller only knows the vibe (cinema-director "--intent" expansion).
 */
export const INTENT_PRESETS: Record<string, IntentPreset> = {
  epic: {
    framing: "extreme wide / establishing shot",
    move: "crane up",
    lighting: "dramatic rim lighting, high contrast",
    lens: "anamorphic",
    grade: "teal-orange cinematic grade, deep blacks",
  },
  intimate: {
    framing: "close-up",
    move: "slow push-in (dolly in)",
    lighting: "soft warm key, gentle falloff",
    lens: "85mm portrait",
    grade: "warm, low-contrast, filmic",
  },
  product: {
    framing: "medium close-up",
    move: "360° orbit",
    lighting: "clean neutral studio light, soft reflections, true-to-color",
    lens: "100mm macro",
    grade: "crisp, color-accurate, premium",
  },
  energetic: {
    framing: "medium wide shot",
    move: "tracking / follow",
    lighting: "punchy directional light, vivid",
    lens: "35mm",
    grade: "saturated, high-energy",
  },
  noir: {
    framing: "medium shot",
    move: "static / locked-off",
    lighting: "single hard key, deep shadows, chiaroscuro",
    lens: "50mm normal",
    grade: "high-contrast, crushed blacks",
  },
};
