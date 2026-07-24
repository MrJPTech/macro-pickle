/**
 * scripts/lib/prompts/ugc.ts
 *
 * UGC / short-form vertical SELLING layer. Encodes the "faceless finds" content
 * forms as presets —
 * the same idea as INTENT_PRESETS in camera.ts, but for *content marketing* rather
 * than cinematography. Plus composers that turn a product (+ optional Gemini-vision
 * ProductDescription from vision.ts) into:
 *   1) a clean studio HERO still  (e-commerce / feed reference photo)
 *   2) a faceless lifestyle STILL (product-in-use, hands only)
 *   3) a 9:16 faceless UGC SPOT   (hook -> demo -> CTA, with a post caption track)
 *
 * This layer sits ABOVE openmontage-video-prompting (which governs cinematography);
 * it decides the *selling structure*. Faceless by default: no face in frame, so no
 * `cast` identity-lock, no face-seed Veo routing, no IP/likeness cost.
 *
 * Knowledge: content/knowledge/PROMPT-COOKBOOK.md §14. Platform rules mined from the
 * opus-clip-automation skill (3-second hook; 21-34s TikTok sweet spot; 3-5 hashtag
 * cap). CTA/caption patterns follow the common creator formulas ("things you didn't know
 * you needed", down-arrow "shop below"). DB-free.
 *
 * IMPORTANT — captions are an EDIT/POST overlay, never rendered by the model. Veo
 * text is garbled, so the generator makes clean footage and the editor burns in the
 * kinetic captions. This mirrors the LYRIC SYNC convention in video.ts.
 */

import type { ImageBrief, VideoBrief } from "./types.js";
import { NEGATIVE_PRESETS } from "./presets.js";

/** Structured product description from Gemini vision (mirror of vision.ts). */
export interface UGCProductDescription {
  detected_text?: string;
  product_type?: string;
  materials?: string;
  suggested_scene?: string;
  usage_context?: string;
}

/** A product to turn into UGC. Benefit-led, not spec-led. No brand/IP names. */
export interface UGCProduct {
  /** kebab id, used for filenames. */
  id: string;
  /** Plain product name (descriptive, never a trademark). */
  name: string;
  /** One-line benefit copy — the "why you need it"; drives the hook + captions. */
  benefit: string;
  /** Short real-world in-use scene (vision.suggested_scene, or hand-written). */
  scene: string;
  /** Optional category tag (camp·water, garden·hydration, …) for flavor. */
  category?: string;
  /** Optional explicit CTA; defaults to the format's CTA. */
  cta?: string;
}

/** A short-form selling format: hook + beat skeleton + caption track + pacing. */
export interface UGCFormat {
  label: string;
  /** When to reach for it. */
  use: string;
  /** 0-3s hook line. Placeholders: {product} {benefit}. */
  hook: string;
  /** What happens in the 3-6s demo beat. Placeholders: {product} {scene} {benefit}. */
  demo: string;
  /** Caption-card track (post overlay). Placeholders: {product} {benefit} {cta}. */
  captions: string[];
  /** Pacing / grade sentence. */
  pacing: string;
  /** Default CTA card. */
  cta: string;
}

/**
 * The seven faceless short-form selling forms. Faceless = product + hands + on-screen
 * captions + music/VO; the brand's documented house style and the safest to generate.
 */
export const UGC_FORMATS: Record<string, UGCFormat> = {
  "faceless-finds": {
    label: "Faceless 'finds'",
    use: "Default scroll-stopper — 'things you didn't know you needed' product reveal.",
    hook: "POV: you just found the {product} that {benefit} — a hand drops it into frame",
    demo: "the {product} proves itself in one clean in-use moment — {scene} — satisfying, hands only, no face",
    captions: [
      "things you didn't know you needed 🛒",
      "{benefit}",
      "{cta} 👇",
    ],
    pacing: "fast, punchy, trending-finds energy; bright true-to-color grade; snappy cuts",
    cta: "link in bio",
  },
  unboxing: {
    label: "Unboxing / first-touch",
    use: "Tactile desire — the reveal and first handling of the product.",
    hook: "unboxing the {product} everyone's been asking about",
    demo: "hands open the packaging and lift out the {product}; slow tactile reveal of finish and detail — {scene}",
    captions: ["unboxing 📦", "{benefit}", "{cta} 👇"],
    pacing: "ASMR-tactile, satisfying, clean studio-to-life; crisp product SFX, gentle music",
    cta: "grab yours",
  },
  "problem-solution": {
    label: "Problem → solution",
    use: "Show the pain, then the product erasing it.",
    hook: "the {product} that {benefit} — watch the difference",
    demo: "the frustrating problem shown for a beat, then the {product} solves it instantly — {scene}",
    captions: ["the problem 😩", "the fix ✅ — {product}", "{cta} 👇"],
    pacing: "before/after contrast, relief payoff; clear, bright, decisive",
    cta: "shop below",
  },
  demo: {
    label: "Quick demo",
    use: "Straight value — how it works in 8 seconds.",
    hook: "here's why the {product} is worth it",
    demo: "a confident, clear demo of the {product} doing its main job — {scene}; every detail readable",
    captions: ["how it works 👀", "{benefit}", "{cta} 👇"],
    pacing: "clean, informative, confident; steady well-lit demo grade",
    cta: "get the link",
  },
  "before-after": {
    label: "Before / after",
    use: "Transformation proof — the strongest selling beat for utility goods.",
    hook: "{product} — before vs after",
    demo: "split or cut: the 'before' state, then the same scene transformed by the {product} — {scene}",
    captions: ["before ❌", "after ✅", "{cta} 👇"],
    pacing: "satisfying transformation reveal; matched framing before and after",
    cta: "link in bio",
  },
  listicle: {
    label: "Listicle / top-pick",
    use: "'#1 summer find' style ranked callout.",
    hook: "the #1 {product} I can't stop recommending",
    demo: "the {product} highlighted as the hero pick with a quick in-use proof — {scene}",
    captions: ["#1 pick of the season 🏆", "{benefit}", "{cta} 👇"],
    pacing: "confident, list-energy, bright; bold caption cards",
    cta: "shop my finds",
  },
  tutorial: {
    label: "Tutorial / how-to",
    use: "Teach a use-case, sell by demonstrating mastery.",
    hook: "the right way to use a {product}",
    demo: "a tight 2-step how-to with the {product} in its setting — {scene}; clear hands-only steps",
    captions: ["step 1", "step 2 — {benefit}", "{cta} 👇"],
    pacing: "instructional, clean, well-lit; calm confident pace",
    cta: "full link below",
  },
};

export type UGCFormatKey = keyof typeof UGC_FORMATS;

/** Faceless guard appended to the video negative so no face is generated. */
const FACELESS_VIDEO_NEG =
  `${NEGATIVE_PRESETS.video}, no human faces in frame, hands and product only, ` +
  `no on-screen rendered text (captions are added in the editor, not by the model)`;

const FACELESS_IMAGE_NEG =
  `${NEGATIVE_PRESETS.product}, no human face in frame, hands and product only`;

function fill(template: string, p: UGCProduct, cta: string): string {
  return template
    .replace(/\{product\}/g, p.name)
    .replace(/\{benefit\}/g, p.benefit)
    .replace(/\{scene\}/g, p.scene)
    .replace(/\{cta\}/g, cta);
}

/**
 * Clean studio HERO still — the e-commerce reference photo. Deliberately
 * BRAND-NEUTRAL: this is the isolated product reference ("clean before you
 * stylize"), so no brand palette or
 * "shot-on-phone" suffix tints it. The brand aesthetic is applied later, to the
 * lifestyle still + spot. If a Gemini-vision ProductDescription is supplied, its
 * OCR'd `detected_text` is added to the negative so foreign text / watermarks /
 * stickers are stripped from the recreation.
 */
export function cleanHeroBrief(
  product: UGCProduct,
  desc?: UGCProductDescription
): ImageBrief {
  const strip = desc?.detected_text?.trim();
  const negative = strip
    ? `${NEGATIVE_PRESETS.product}, remove all printed text, branding, watermarks and stickers, especially: "${strip}"`
    : "product";
  return {
    subject: `${product.name} — a clean studio e-commerce hero shot of the product alone on a seamless neutral background`,
    context: desc?.materials ? `materials and finish: ${desc.materials}` : undefined,
    composition:
      "product centered, three-quarter hero angle, full product in frame, soft contact shadow",
    lighting:
      "clean neutral softbox studio light, true-to-color, soft even reflections, no harsh colored cast",
    style: "premium catalog product photography, crisp, color-accurate",
    aspect: "4:5",
    quality: "photoreal",
    negative,
  };
}

/**
 * Faceless lifestyle STILL — product in its real in-use scene, hands only. `style`
 * is intentionally left unset so the brand profile's own style sentence drives the
 * aesthetic (falls back to the `photoreal` quality suffix when no brand is given).
 */
export function ugcStillBrief(product: UGCProduct, brand?: string): ImageBrief {
  return {
    subject: `${product.name} in authentic real-world use`,
    context: product.scene,
    composition:
      "vertical 9:16 phone-shot framing, product is the clear hero, a person's hands interact with it, face out of frame",
    lighting: "natural available daylight, authentic candid UGC look, true-to-color",
    aspect: "9:16",
    quality: "photoreal",
    negative: FACELESS_IMAGE_NEG,
    brand,
  };
}

/**
 * 9:16 faceless UGC SPOT (~8s clip). hook (0-3s) -> demo (3-6s) -> CTA (6-8s),
 * with a post caption track. One clip; the assembled post stitches 1-3 of these to
 * the 21-34s TikTok sweet spot (see cookbook §14).
 */
export function ugcSpotBrief(
  product: UGCProduct,
  formatKey: UGCFormatKey = "faceless-finds",
  brand?: string
): VideoBrief {
  const fmt = UGC_FORMATS[formatKey] ?? UGC_FORMATS["faceless-finds"]!;
  const cta = product.cta ?? fmt.cta;
  return {
    scene: `${product.scene}. Vertical short-form social video, authentic shot-on-phone UGC look, natural daylight.`,
    subject: `${product.name} — the product itself is the hero; a person's hands demonstrate it; face never shown`,
    camera: { size: "medium close-up", move: "handheld", lens: "24mm wide", speed: "quick, snappy" },
    beats: [
      { time: "0.0-3.0s", action: `HOOK — ${fill(fmt.hook, product, cta)}; punchy first-frame, instant scroll-stopper` },
      { time: "3.0-6.0s", action: `DEMO — ${fill(fmt.demo, product, cta)}` },
      { time: "6.0-8.0s", action: `CTA — final clean beauty shot of the ${product.name}; a hand gestures to a link/shop sticker` },
    ],
    audio:
      "upbeat trending-style music bed; crisp real product SFX (zip, click, water, fabric); optional friendly voiceover reading the on-screen captions",
    captions: fmt.captions.map((c) => fill(c, product, cta)),
    format: formatKey,
    pacing: fmt.pacing,
    durationSec: 8,
    aspect: "9:16",
    negative: FACELESS_VIDEO_NEG,
    brand,
  };
}

/** Convenience: the full faceless UGC trio for one product. */
export function ugcBriefSet(
  product: UGCProduct,
  formatKey: UGCFormatKey = "faceless-finds",
  brand?: string,
  desc?: UGCProductDescription
): { hero: ImageBrief; still: ImageBrief; spot: VideoBrief } {
  return {
    hero: cleanHeroBrief(product, desc), // brand-neutral studio reference
    still: ugcStillBrief(product, brand),
    spot: ugcSpotBrief(product, formatKey, brand),
  };
}

/** List the available format keys (for CLI/MCP help text). */
export function listUGCFormats(): { key: string; label: string; use: string }[] {
  return Object.entries(UGC_FORMATS).map(([key, f]) => ({ key, label: f.label, use: f.use }));
}
