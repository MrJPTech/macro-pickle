/**
 * Few-shot exemplars for the prompt enhancer.
 *
 * Compact, hand-curated set inspired by the structure of high-quality
 * text-to-image prompt datasets (e.g. MohamedRashad/midjourney-detailed-prompts
 * on Hugging Face) and the Hunyuan PromptEnhancer (CVPR 2026) chain-of-thought
 * rewriting methodology. These steer the Gemini enhancer toward dense,
 * well-structured prompts without shipping a multi-thousand-row dataset into
 * the repo. Add your own brand exemplars here to bias the
 * enhancer toward house style.
 */

export interface PromptExemplar {
  raw: string;
  enhanced: string;
}

/** Raw idea → enhanced reference-frame prompt (text-to-image). */
export const IMAGE_PROMPT_EXEMPLARS: PromptExemplar[] = [
  {
    raw: "a streetwear cannabis box on a table",
    enhanced:
      "Studio product photograph of a bold graphic-printed product box standing upright on a matte black surface, dramatic single key light from camera-left with soft fill, glossy laminate catching a controlled specular highlight, shallow depth of field (85mm, f/2.8), rich saturated magenta and black palette, crisp embossed logo detail, seamless dark-to-charcoal gradient backdrop, high-end advertising aesthetic, photorealistic, 8k",
  },
  {
    raw: "founder portrait, suit, modern",
    enhanced:
      "Editorial portrait of a confident tech founder in a tailored charcoal suit, three-quarter pose, soft directional Rembrandt lighting, clean minimalist studio backdrop with subtle teal gradient, 50mm lens at f/2.0, natural skin texture, sharp catchlights, neutral white balance so wardrobe colors read true, Forbes-cover composition, photorealistic",
  },
  {
    raw: "cinematic city street at night for a music video",
    enhanced:
      "Cinematic wide establishing shot of a rain-slicked downtown street at night, neon storefront signage reflecting in wet asphalt, volumetric haze, anamorphic lens flares, teal-and-orange color grade, shallow depth of field, 35mm film grain, moody low-key lighting with practical light sources, hyperreal, shot on ARRI Alexa",
  },
  {
    raw: "character holding a coin, mascot style",
    enhanced:
      "Full-body hero render of a stylized cartoon tycoon mascot character holding up a single gleaming gold coin, exaggerated confident pose, clean vector-meets-3D look, soft studio rim light separating subject from a smooth gradient backdrop, consistent character design with bold outlines, vibrant but neutral-lit so printed accent colors read true, centered composition with headroom for cropping",
  },
];

/**
 * Character reference exemplars — for consistent recurring subjects (mascots,
 * brand characters, a recurring presenter). Emphasizes identity-locking attributes
 * so a batch stays on-model. (Taxonomy idea from BigBanana-AI-Director's
 * character/scene/keyframe prompt split.)
 */
export const CHARACTER_PROMPT_EXEMPLARS: PromptExemplar[] = [
  {
    raw: "the money mascot, front view",
    enhanced:
      "Full-body character reference sheet of a stylized cartoon tycoon mascot: round friendly face, signature top hat, monocle, tailored suit with gold buttons, white gloves, confident grin — front-facing neutral A-pose, even diffuse studio lighting so every design detail is legible, plain light-gray backdrop, crisp bold outlines, consistent proportions for character-lock, no dramatic shadows that hide features",
  },
  {
    raw: "founder character, three-quarter, recurring",
    enhanced:
      "Character reference of a tech founder: short dark hair, neat stubble, charcoal tailored suit, signature minimalist look — three-quarter turn, neutral expression, soft even key light, plain seamless backdrop, sharp facial detail and consistent facial geometry for cross-shot identity consistency, photorealistic, neutral white balance",
  },
];

/**
 * Scene / environment exemplars — establishing backdrops the subject lives in.
 */
export const SCENE_PROMPT_EXEMPLARS: PromptExemplar[] = [
  {
    raw: "the bank vault set",
    enhanced:
      "Wide environment establishing shot of an opulent bank vault interior: polished marble floor, towering brushed-steel safe-deposit walls, warm overhead practicals with cool rim accents, stacks of gold bars on a central pedestal, volumetric dust in light beams, cinematic depth, anamorphic framing, no characters in frame, photoreal production design",
  },
  {
    raw: "neon city alley backdrop",
    enhanced:
      "Empty rain-slicked neon alley at night, dense signage in pink and cyan reflecting on wet pavement, steam from a grate, layered depth with foreground silhouette framing, moody low-key cinematic lighting, 35mm, shallow focus falloff, photoreal urban environment, no subject present",
  },
];

/** Raw idea → enhanced Veo video prompt (subject · action · scene · camera · light · audio). */
export const VIDEO_PROMPT_EXEMPLARS: PromptExemplar[] = [
  {
    raw: "the box spins to show all sides",
    enhanced:
      "The graphic-printed product box rotates slowly a full 360° on its vertical axis, centered on a matte black pedestal. Camera holds a locked-off medium close-up, slow push-in over the duration. Soft key light from camera-left stays fixed so the printed colors read true; controlled specular travels across the laminate as it turns. Subtle studio room tone, a low cinematic bass swell. Premium product-reveal energy, photoreal.",
  },
  {
    raw: "founder turns to camera and smiles",
    enhanced:
      "The suited founder begins in three-quarter profile, then turns smoothly to face camera and offers a subtle confident smile. Camera performs a slow dolly-in from medium to medium close-up. Soft Rembrandt key with gentle fill, neutral white balance. Quiet ambient studio tone with a soft uplifting pad underneath. Natural, grounded, editorial.",
  },
  {
    raw: "money flying around the character",
    enhanced:
      "The tycoon mascot stands center frame as gold coins and banknotes swirl in a slow upward spiral around him; he tips his hat. Camera orbits 45° around the subject at a steady speed. Bright key with warm rim light, smooth motion blur on the flying currency. Playful orchestral hit with coin-clink foley. Energetic, polished, brand-commercial tone.",
  },
];

/** Reference-frame prompt category (taxonomy from BigBanana-AI-Director). */
export type ImagePromptKind = "general" | "character" | "scene" | "keyframe";

/**
 * The "Perfect Prompt" formula (adapted from the Nano-Banana skill in
 * SamurAIGPT/Generative-Media-Skills) — the structural backbone the enhancer
 * reasons through for image prompts.
 */
export const PERFECT_PROMPT_FORMULA =
  "Subject (+ key attributes) · Action/pose · Context/setting · Composition & framing · Lens & depth of field · Lighting · Color palette · Style/medium · Detail level";

/** Per-kind guidance appended to the enhancer instruction. */
export const KIND_GUIDANCE: Record<ImagePromptKind, string> = {
  general: "",
  character:
    "This is a CHARACTER reference: lock identity-defining attributes (face geometry, wardrobe, signature items), use even legible lighting, neutral pose/backdrop so the design reads clearly for cross-shot consistency.",
  scene:
    "This is a SCENE/environment reference: describe the setting, production design, depth layers and lighting; keep it empty of the main subject so it can host them later.",
  keyframe:
    "This is a KEYFRAME for video: describe an explicit, well-composed single moment (the intended start OR end frame) with clear subject placement, since Veo will interpolate motion between keyframes.",
};

export function exemplarsForKind(kind: ImagePromptKind): PromptExemplar[] {
  if (kind === "character") return CHARACTER_PROMPT_EXEMPLARS;
  if (kind === "scene") return SCENE_PROMPT_EXEMPLARS;
  return IMAGE_PROMPT_EXEMPLARS;
}
