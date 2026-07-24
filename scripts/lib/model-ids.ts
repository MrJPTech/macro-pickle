/**
 * scripts/lib/model-ids.ts
 *
 * The concrete, rail-facing model-ID maps every generation rail imports to make
 * an actual API call (VEO_MODELS, KLING_MODELS, SEEDANCE_MODELS, WAN_MODELS,
 * OMNI_MODEL) — the ONE place to bump a version string. Each rail imports its
 * slice from here and re-exports it, so a future model bump is a one-file edit.
 *
 * Distinct from the higher-level catalog/selection/dispatch subsystem in
 * scripts/lib/models/ (capabilities/pricing/tiers for a future web/membership
 * layer). That describes models; THIS resolves the endpoint strings rails call.
 *
 * Leaf module by design: it imports NOTHING from the rails (no circular deps).
 * Per-second RATE tables + estimate functions stay in each rail file (they're
 * rail-specific pricing logic) — this file is model *identity* only.
 *
 * Slugs verified live against the fal.ai model pages + Generative Language API
 * on 2026-07-21. Prices in the rail files are $/second of OUTPUT; confirm on the
 * exact model page before a large paid run.
 */

/* ─────────────────────────────  Veo — Google (@google/genai)  ───────────────────────────── */
// Only the three 3.1 tiers are exposed by ListModels on the current key; the
// legacy 3.0/2.0 IDs 404, so veo3/veo3-fast/veo2 are kept as ALIASES onto 3.1 fast.
export const VEO_MODELS = {
  quality: "veo-3.1-generate-preview",
  fast: "veo-3.1-fast-generate-preview",
  lite: "veo-3.1-lite-generate-preview",
  veo3: "veo-3.1-fast-generate-preview",
  "veo3-fast": "veo-3.1-fast-generate-preview",
  veo2: "veo-3.1-fast-generate-preview",
} as const;
export type VeoKey = keyof typeof VEO_MODELS;
export const VEO_LABEL: Record<VeoKey, string> = {
  quality: "Veo 3.1 Quality",
  fast: "Veo 3.1 Fast",
  lite: "Veo 3.1 Lite",
  veo3: "Veo 3.1 Fast (was 3.0)",
  "veo3-fast": "Veo 3.1 Fast (was 3.0-fast)",
  veo2: "Veo 3.1 Fast (was 2.0)",
};

/* ─────────────────────────────  Kling — Kuaishou (via fal.ai)  ─────────────────────────────
 * Bumped to Kling 3.0 (Feb 2026). i2v-pro/i2v-std/t2v-pro are v3; t2v-master stays
 * on 2.1 master (a distinct, still-useful look). i2v-pro's slug moved v2.6 → v3/pro
 * (verified `fal-ai/kling-video/v3/pro/image-to-video`, 2026-07-21). */
export const KLING_MODELS = {
  "i2v-pro":    "fal-ai/kling-video/v3/pro/image-to-video",
  "i2v-std":    "fal-ai/kling-video/v3/standard/image-to-video",
  "t2v-pro":    "fal-ai/kling-video/v3/pro/text-to-video",
  "t2v-master": "fal-ai/kling-video/v2.1/master/text-to-video",
  "i2v-4k":     "fal-ai/kling-video/v3/4k/image-to-video",
} as const;
export type KlingKey = keyof typeof KLING_MODELS;
export const KLING_LABEL: Record<KlingKey, string> = {
  "i2v-pro":    "Kling 3.0 Pro (i2v)",
  "i2v-std":    "Kling 3.0 Standard (i2v)",
  "t2v-pro":    "Kling 3.0 Pro (t2v)",
  "t2v-master": "Kling 2.1 Master (t2v)",
  "i2v-4k":     "Kling 3.0 4K (i2v)",
};

/* ─────────────────────────  Omni Flash — Google (@google/genai)  ─────────────────────────
 * #1 on every Arena board (2026-07). Conversational gen + v2v edit via the
 * Interactions API. PAID tier only (~$0.10/s); no start+end keyframes; 10s / 720p. */
export const OMNI_MODEL = "gemini-omni-flash-preview";

/* ─────────────────────────────  Seedance 2.0 — ByteDance (via fal.ai)  ─────────────────────
 * #2 Arena. i2v supports start + END keyframes (image_url + end_image_url); the
 * 9-image multi-ref lives on the t2v endpoint. Slugs verified 2026-07-21. */
export const SEEDANCE_MODELS = {
  t2v: "bytedance/seedance-2.0/text-to-video",
  i2v: "bytedance/seedance-2.0/image-to-video",
} as const;
export type SeedanceKey = keyof typeof SEEDANCE_MODELS;
export const SEEDANCE_LABEL: Record<SeedanceKey, string> = {
  t2v: "Seedance 2.0 (t2v)",
  i2v: "Seedance 2.0 (i2v · start+end)",
};

/* ─────────────────────────────  Wan 2.7 — Alibaba (via fal.ai)  ────────────────────────────
 * #3 Arena, best price/quality of the frontier ($0.10/s @720p, $0.15/s @1080p).
 * First+last keyframes (image_url + end_image_url), reference-to-video + voice
 * clone, and a v2v edit endpoint. Slugs verified 2026-07-21. */
export const WAN_MODELS = {
  t2v: "fal-ai/wan/v2.7/text-to-video",
  i2v: "fal-ai/wan/v2.7/image-to-video",
  ref: "fal-ai/wan/v2.7/reference-to-video",
  edit: "fal-ai/wan/v2.7/edit-video",
} as const;
export type WanKey = keyof typeof WAN_MODELS;
export const WAN_LABEL: Record<WanKey, string> = {
  t2v: "Wan 2.7 (t2v)",
  i2v: "Wan 2.7 (i2v · first+last)",
  ref: "Wan 2.7 (reference-to-video)",
  edit: "Wan 2.7 (v2v edit)",
};
