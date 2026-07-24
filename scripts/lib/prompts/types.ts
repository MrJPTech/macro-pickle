/**
 * scripts/lib/prompts/types.ts
 *
 * Structured input shapes for the Prompt Engine. These turn the macro-pickle
 * prompting *knowledge* (formulas trapped in content/gemini-gem-guide.md and the
 * reference repos) into typed data the builders can render deterministically.
 */

import type { CameraMove, Lens, ShotSize } from "./camera.js";
import type { NegativePreset, QualityStyle } from "./presets.js";

/**
 * Brand/style profile — the youtube-shorts "niche profile" pattern. One file per
 * brand (content/brands/<name>.json) so each brand's aesthetic is
 * machine-loadable and auto-applied to every prompt. DB-free by design.
 */
export interface BrandProfile {
  name: string;
  /** Master art/visual-style sentence. */
  style: string;
  /** HEX codes or named brand colors. */
  palette: string[];
  /** Concrete subjects/compositions to prefer. */
  prefer?: string[];
  /** Anti-patterns; folded into the negative prompt as an "Avoid:" list. */
  avoid?: string[];
  /** Auto-appended to every prompt for this brand (overrides quality suffix). */
  promptSuffix?: string;
  /** Default aspect ratio for this brand. */
  aspect?: string;
  /** Cast: friendly name → trademark-safe descriptive proxy. */
  cast?: Record<string, string>;
}

/**
 * Nano Banana "Perfect Prompt" formula:
 *   Subject + Action + Context + Composition + Lighting + Style
 * (Generative-Media-Skills/library/visual/nano-banana). Full sentences, no
 * keyword soup; exact on-image text rendered in double quotes.
 */
export interface ImageBrief {
  subject: string;
  action?: string;
  context?: string; // environment / setting
  composition?: string; // shot size, lens, framing
  lighting?: string;
  style?: string;
  /** Exact text to render on the image (wrapped in quotes for the model). */
  text?: string;
  aspect?: string;
  quality?: QualityStyle;
  negative?: NegativePreset | string;
  /** Brand profile name to apply (content/brands/<brand>.json). */
  brand?: string;
  /** @-reference handles, e.g. ["@Image1 as the character", "@Image2 scene"]. */
  refs?: string[];
}

/** One time-segmented action beat (Seedance time-stamped beat). */
export interface Beat {
  /** e.g. "0.0-3.0s". */
  time: string;
  action: string;
}

/**
 * Seedance/Veo "Director Brief" six-component hierarchy:
 *   Scene · Subject · Camera · Action · Audio · Pacing/Style
 * (Generative-Media-Skills/library/motion/seedance-2).
 */
export interface VideoBrief {
  scene: string; // environment + lighting
  subject: string; // identity + detail
  camera?: {
    move?: CameraMove | string;
    lens?: Lens | string;
    size?: ShotSize | string;
    speed?: string;
  };
  /** Time-segmented action; single-beat rule enforced by lintScene. */
  beats?: Beat[];
  audio?: string; // music + SFX + ambience (Seedance generates audio natively)
  /**
   * Synced lyric bar(s) for this shot — the AUDIO BED only. Rendered as a
   * "LYRIC SYNC" note for the editor/Flow; never on-screen text, never a
   * literal depiction of the bar (see content/lyrics/8th-day-out.json compliance).
   */
  lyric?: string;
  pacing?: string; // timing + mood + grade
  durationSec?: number;
  aspect?: string;
  /** Append the verbatim consistency clause (recurring characters). */
  consistency?: boolean;
  negative?: NegativePreset | string;
  brand?: string;
  /** @-reference handles for multi-asset image-to-video. */
  refs?: string[];
  /** Optional INTENT_PRESETS key to seed camera + lighting + grade. */
  intent?: string;
  /**
   * Optional UGC_FORMATS key (ugc.ts) — the short-form SELLING form
   * (faceless-finds, unboxing, problem-solution, …). Rendered as a FORMAT label.
   */
  format?: string;
  /**
   * On-screen caption cards — the kinetic-caption / text-overlay track. These are
   * an EDIT/POST overlay, NOT rendered by the model (Veo text is garbled); the
   * editor burns them in. Same audio-bed-only convention as `lyric`.
   */
  captions?: string[];
}

/**
 * Canonical macro-pickle storyboard scene — mirrors the schema already used in
 * content/*-prompts.md (gemini-gem-guide.md "Canonical Output Schema"), now as a
 * typed object so it can be serialized, linted, and round-tripped.
 */
export interface Scene {
  number: number;
  title: string;
  summary: string;
  /** e.g. "EXT. CITY STREET - NIGHT". */
  setting: string;
  subject: string;
  beats: Beat[];
  /** Looping background motion (haze, particles, birds) that keeps frames alive. */
  atmospherics?: string;
  style: string;
}
