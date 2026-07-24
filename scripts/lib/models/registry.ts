/**
 * scripts/lib/models/registry.ts
 *
 * Cross-provider AI VIDEO model registry — the single source of truth for
 * "which models can macro-pickle call, from where, at what price, with what
 * capabilities." This unifies the per-rail alias maps (fal.ts FAL_IMAGE_MODELS,
 * veo.ts VEO_MODELS, kling.ts …) into ONE typed catalog so a future
 * membership/web layer can list models, let a user pick, resolve the right
 * environment API key, and dispatch a generation call.
 *
 * DB-free by design: this is authored-in-code data, compile-time type-checked.
 * Populated from the July 2026 model landscape research
 * (IT-MAN vault → Tools/AI-Video-Models). Where a field was flagged unverified
 * in that research, `verified: false` + a `notes` explanation (never assert as
 * fact what the report flagged).
 *
 * The field moves monthly — re-verify slugs/prices against the provider before
 * relying on them. See scripts/lib/models/README-style notes in the vault.
 */

/** Which service/SDK the model is called through (drives env-key + client). */
export type Provider =
  | "google" // @google/genai (Gemini API) — Veo, Omni Flash
  | "fal" // @fal-ai/client — Seedance, Kling, Wan, HappyHorse, PixVerse, Vidu, LTX, Grok, Luma, MiniMax
  | "byteplus" // BytePlus/Volcengine ModelArk REST (Node SDK) — Seedance first-party (cheapest)
  | "runway" // dev.runwayml.com — Gen-4.5, Aleph 2.0, Act-Two
  | "replicate" // replicate.com — Veo, PixVerse, LTX, MiniMax, Luma (alt host)
  | "openai"; // Sora — DISQUALIFIED (API sunsets 2026-09-24)

/** Pipeline-relevant capability flags. Presence in `capabilities` = supported. */
export type Capability =
  | "t2v" // text-to-video
  | "i2v" // image-to-video / start frame
  | "startEndKeyframe" // accepts BOTH a first and last frame (interpolation)
  | "references" // reference-image / character consistency / multi-ref
  | "v2v" // video-to-video edit / restyle
  | "audio"; // native audio + lip-sync

export type ModelStatus =
  | "recommended" // wire this now (top shortlist)
  | "wired" // already called by an existing macro-pickle rail
  | "alternate" // solid, situational
  | "watch" // promising, less battle-tested
  | "disqualified"; // do not build on

export interface ModelEntry {
  /** Canonical macro-pickle id (stable; used by CLI/config/routes). */
  id: string;
  /** Human-readable name. */
  label: string;
  provider: Provider;
  /** Model id / slug passed to the provider client (verify per §notes). */
  endpoint: string;
  /** Env var that supplies this provider's API key (see providers.ts). */
  envKey: string;
  capabilities: Capability[];
  price: {
    /** Representative USD per second of output for this endpoint. */
    perSecondUsd?: number;
    note?: string;
  };
  limits: { maxSeconds?: number; maxResolution?: string; fps?: number; note?: string };
  /** Artificial Analysis Video Arena Elo (July 2026), where the model ranks. */
  arena?: { t2vAudioElo?: number; i2vAudioElo?: number; note?: string };
  status: ModelStatus;
  /** 1 = frontier · 2 = Google incumbent · 3 = western incumbent · 4 = specialist/cheap/open. */
  tier: 1 | 2 | 3 | 4;
  /** false = at least one field here was flagged unverified in research (see notes). */
  verified: boolean;
  notes?: string;
  /** Primary source URL. */
  docs?: string;
}

/**
 * The catalog. Ordered roughly by shortlist priority. Prices are representative
 * per-second USD for the listed endpoint; alternate provider prices live in notes.
 */
export const MODEL_REGISTRY: ModelEntry[] = [
  // ── Tier 1 — frontier, shortlist ──────────────────────────────────────────
  {
    id: "omni-flash",
    label: "Gemini Omni Flash",
    provider: "google",
    endpoint: "gemini-omni-flash-preview",
    envKey: "GOOGLE_API_KEY",
    capabilities: ["t2v", "i2v", "references", "v2v", "audio"],
    price: { perSecondUsd: 0.1, note: "720p; $17.50/1M output tokens; paid-tier only" },
    limits: { maxSeconds: 10, maxResolution: "720p", fps: 24 },
    arena: { t2vAudioElo: 1239, i2vAudioElo: 1201, note: "#1 on all four boards" },
    status: "wired", // scripts/lib/omni.ts (edit path); generation not yet wired
    tier: 1,
    verified: true,
    notes:
      "#1 quality + native audio + conversational v2v edit. CANNOT do start+end keyframe interpolation (explicitly unsupported); 10s/720p cap. Wired for EDIT in scripts/lib/omni.ts; t2v/i2v generation supported by the API but not yet wired.",
    docs: "https://ai.google.dev/gemini-api/docs/omni",
  },
  {
    id: "seedance-2.0",
    label: "Seedance 2.0 (via fal)",
    provider: "fal",
    endpoint: "bytedance/seedance-2.0/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "references", "v2v", "audio"],
    price: { perSecondUsd: 0.3, note: "720p $0.3024/s · 1080p $0.682/s" },
    limits: { maxSeconds: 15, maxResolution: "1080p", fps: 24 },
    arena: { t2vAudioElo: 1225, i2vAudioElo: 1196, note: "#2 on all boards" },
    status: "recommended",
    tier: 1,
    verified: false,
    notes:
      "Keyframe + richest multi-ref workhorse (start+end via image_url+end_image_url; up to 9 img + 3 vid + 3 audio refs on the reference endpoint). VERIFY the exact @fal-ai/client endpoint prefix (model page path is bytedance/seedance-2.0/*; client id may be fal-ai/bytedance/...). Cheaper first-party via seedance-2.0-byteplus.",
    docs: "https://fal.ai/models/bytedance/seedance-2.0/image-to-video",
  },
  {
    id: "seedance-2.0-byteplus",
    label: "Seedance 2.0 (via BytePlus — cheapest)",
    provider: "byteplus",
    endpoint: "Doubao-Seedance-2.0",
    envKey: "BYTEPLUS_API_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "references", "v2v", "audio"],
    price: { perSecondUsd: 0.14, note: "~46 CNY/1M tokens gen (~$0.14/s); ~2x cheaper than fal" },
    limits: { maxSeconds: 15, maxResolution: "1080p", fps: 24 },
    arena: { t2vAudioElo: 1225, i2vAudioElo: 1196 },
    status: "recommended",
    tier: 1,
    verified: false,
    notes:
      "Same model as seedance-2.0, first-party on BytePlus/Volcengine ModelArk — the cost lever (~2x cheaper than fal). CONFIRM exact model-id string + per-second price in the BytePlus console (Doubao-Seedance-2.0 is the Volcengine brand string; international slug may differ). Node SDK, async submit-poll.",
    docs: "https://docs.byteplus.com/en/docs/ModelArk/2291680",
  },
  {
    id: "wan-2.7",
    label: "Wan 2.7 (via fal)",
    provider: "fal",
    endpoint: "fal-ai/wan/v2.7/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "references", "v2v", "audio"],
    price: { perSecondUsd: 0.1, note: "~$0.10/s flat (10s @1080p = $1.00)" },
    limits: { maxSeconds: 15, maxResolution: "1080p", fps: 30 },
    arena: { t2vAudioElo: 1160, i2vAudioElo: 1098, note: "#3 t2v-with-audio" },
    status: "recommended",
    tier: 1,
    verified: true,
    notes:
      "Value winner: cheapest of the frontier tier, first+last keyframes, reference-to-video + voice-clone (≤5 ref videos), 30fps. Open weights on ModelScope (Apache-2.0).",
    docs: "https://fal.ai/wan-2.7",
  },
  {
    id: "happyhorse-1.1",
    label: "HappyHorse 1.1 (Alibaba, via fal)",
    provider: "fal",
    endpoint: "alibaba/happy-horse/v1.1/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "audio"],
    price: { perSecondUsd: 0.18, note: "1080p" },
    limits: { maxSeconds: 15 },
    arena: { t2vAudioElo: 1150, i2vAudioElo: 1110, note: "#2–3 on the audio-less board" },
    status: "watch",
    tier: 1,
    verified: true,
    notes: "Strong newcomer; less battle-tested. start+end via 2 image URLs.",
    docs: "https://fal.ai/happyhorse-1.0",
  },

  // ── Tier 2 — Google incumbent (already wired) ─────────────────────────────
  {
    id: "veo-3.1",
    label: "Veo 3.1",
    provider: "google",
    endpoint: "veo-3.1-generate-preview",
    envKey: "GOOGLE_API_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "references", "audio"],
    price: { perSecondUsd: 0.4, note: "Std 720p/1080p $0.40 · 4K $0.60 · Fast $0.10–0.12 · Lite $0.05–0.08" },
    limits: { maxSeconds: 8, maxResolution: "4K", fps: 24 },
    arena: { t2vAudioElo: 1095, i2vAudioElo: 1088 },
    status: "wired", // scripts/lib/veo.ts (pnpm veo)
    tier: 2,
    verified: true,
    notes:
      "Already wired (scripts/lib/veo.ts). Best-in-class video extension (+7s ×20), 4K, and Ingredients (3 refs). 8s native. Fast tier (veo-3.1-fast-generate-preview) is the cheap workhorse at $0.10/s.",
    docs: "https://ai.google.dev/gemini-api/docs/veo",
  },
  {
    id: "kling-3.0",
    label: "Kling 3.0 (via fal)",
    provider: "fal",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "references", "audio"],
    price: { perSecondUsd: 0.112, note: "TIER VARIES: i2v Std $0.084 · Pro t2v $0.112 · landing page cites $0.168–0.392" },
    limits: { maxSeconds: 15, maxResolution: "1080p" },
    arena: { t2vAudioElo: 1110, i2vAudioElo: 1073 },
    status: "wired", // scripts/lib/kling.ts (pnpm kling)
    tier: 2,
    verified: false,
    notes:
      "Already wired (scripts/lib/kling.ts). Best multi-shot storyboard + element/character refs. Per-second price varies by tier/mode across fal's own pages — confirm on the chosen variant's page.",
    docs: "https://fal.ai/kling-3",
  },

  // ── Tier 3 — western incumbents (differentiated control, mid quality) ──────
  {
    id: "runway-aleph-2",
    label: "Runway Aleph 2.0 (video-to-video editing)",
    provider: "runway",
    endpoint: "aleph2",
    envKey: "RUNWAY_API_KEY",
    capabilities: ["v2v", "references"],
    price: { perSecondUsd: 0.28, note: "28 credits/s @ $0.01/credit; 56-credit min" },
    limits: { maxSeconds: 30, note: "2–30s input" },
    status: "alternate",
    tier: 3,
    verified: true,
    notes:
      "Best-in-class in-context v2v EDITING: object swap / restyle / relight while preserving the rest; up to 5 keyframes (first/last/timestamp). Use Runway ONLY for its own models (Aleph 2.0, Act-Two, Gen-4.5) — its resold Seedance/Veo are marked up.",
    docs: "https://docs.dev.runwayml.com/guides/pricing/",
  },
  {
    id: "runway-act-two",
    label: "Runway Act-Two (performance transfer)",
    provider: "runway",
    endpoint: "act_two",
    envKey: "RUNWAY_API_KEY",
    capabilities: ["references", "v2v"],
    price: { perSecondUsd: 0.05, note: "5 credits/s" },
    limits: {},
    status: "alternate",
    tier: 3,
    verified: true,
    notes: "Character performance / facial transfer from a driving video + voice change.",
    docs: "https://docs.dev.runwayml.com/guides/pricing/",
  },
  {
    id: "runway-gen-4.5",
    label: "Runway Gen-4.5",
    provider: "runway",
    endpoint: "gen4.5",
    envKey: "RUNWAY_API_KEY",
    capabilities: ["t2v", "i2v", "references"],
    price: { perSecondUsd: 0.12, note: "12 credits/s" },
    limits: { maxSeconds: 10 },
    status: "alternate",
    tier: 3,
    verified: true,
    notes: "Runway's own flagship generator; no longer top-tier on the Arena.",
    docs: "https://docs.dev.runwayml.com/guides/pricing/",
  },
  {
    id: "luma-ray-3.2",
    label: "Luma Ray 3.2 (via fal)",
    provider: "fal",
    endpoint: "luma/agent/ray/v3.2/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "v2v"],
    price: { perSecondUsd: 0.2, note: "fal retail ~1.7–3.3x Luma direct; official 5s@1080p $1.20" },
    limits: { maxSeconds: 10, maxResolution: "1080p" },
    status: "alternate",
    tier: 3,
    verified: false,
    notes:
      "SILENT (no native audio). Up to 16 keyframes. Character-reference support is CONFLICTED across sources (Luma/fal say yes, Replicate says no) — verify. Native 16-bit HDR/EXR.",
    docs: "https://lumalabs.ai/api",
  },
  {
    id: "hailuo-2.3",
    label: "MiniMax Hailuo 2.3 (via fal)",
    provider: "fal",
    endpoint: "fal-ai/minimax/hailuo-2.3/pro/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "references"],
    price: { note: "per-clip: 768p/6s $0.28 · 1080p/6s $0.49 (Fast ~⅔)" },
    limits: { maxSeconds: 10, maxResolution: "1080p" },
    status: "alternate",
    tier: 3,
    verified: false,
    notes:
      "No native audio (separate speech API). Dual-keyframe (start+end) documented for Hailuo-02; unclear whether 2.3 supports it or is single-image only — verify before relying.",
    docs: "https://platform.minimax.io/docs/guides/video-generation",
  },

  // ── Tier 4 — specialist / cheap / open ────────────────────────────────────
  {
    id: "grok-imagine-1.5",
    label: "Grok Imagine 1.5 (xAI, via fal)",
    provider: "fal",
    endpoint: "xai/grok-imagine-video/v1.5/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "references", "audio"],
    price: { perSecondUsd: 0.14, note: "$0.08 @480p · $0.14 @720p (xAI direct)" },
    limits: { maxSeconds: 15, maxResolution: "1080p" },
    arena: { i2vAudioElo: 1117, note: "#3 image-to-video" },
    status: "alternate",
    tier: 4,
    verified: false,
    notes: "Strong i2v. NO start+end keyframe (first-frame anchor only). Also first-party at docs.x.ai.",
    docs: "https://docs.x.ai/developers/model-capabilities/video/generation",
  },
  {
    id: "pixverse-v6",
    label: "PixVerse V6 (via fal)",
    provider: "fal",
    endpoint: "fal-ai/pixverse/v6/transition",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "audio"],
    price: { perSecondUsd: 0.09, note: "res-tiered $0.025–0.115/s" },
    limits: { maxSeconds: 15, maxResolution: "1080p" },
    status: "alternate",
    tier: 4,
    verified: true,
    notes: "Cheap. start+end via the dedicated `transition` endpoint. Also on Replicate (pixverse/pixverse-v6).",
    docs: "https://fal.ai/pixverse-v6",
  },
  {
    id: "vidu-q3-pro",
    label: "Vidu Q3 Pro (via fal)",
    provider: "fal",
    endpoint: "fal-ai/vidu/q3/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "audio"],
    price: { perSecondUsd: 0.154, note: "$0.07 @≤540p · ~$0.154 @1080p" },
    limits: { maxSeconds: 16 },
    status: "alternate",
    tier: 4,
    verified: true,
    notes: "Dedicated fal-ai/vidu/start-end-to-video endpoint for keyframe transitions. Native lip-sync.",
    docs: "https://fal.ai/models/fal-ai/vidu/q3/image-to-video",
  },
  {
    id: "ltx-2.3",
    label: "LTX-2.3 (Lightricks, via fal / open-weight)",
    provider: "fal",
    endpoint: "fal-ai/ltx-2.3/image-to-video",
    envKey: "FAL_KEY",
    capabilities: ["t2v", "i2v", "startEndKeyframe", "audio"],
    price: { perSecondUsd: 0.04, note: "fal t2v $0.06 · fast i2v $0.04; open weights = self-host free" },
    limits: { maxSeconds: 20, maxResolution: "4K", fps: 50 },
    status: "alternate",
    tier: 4,
    verified: true,
    notes: "Cheapest hosted + open weights (HF Lightricks/LTX-2.3, Replicate lightricks/ltx-2.3-*). Flexible first/last-frame.",
    docs: "https://fal.ai/models/fal-ai/ltx-2.3/text-to-video/api",
  },

  // ── Disqualified ──────────────────────────────────────────────────────────
  {
    id: "sora-2",
    label: "OpenAI Sora 2 — DISQUALIFIED",
    provider: "openai",
    endpoint: "sora-2",
    envKey: "OPENAI_API_KEY",
    capabilities: ["t2v", "i2v", "audio"],
    price: { perSecondUsd: 0.1, note: "sora-2 $0.10 · sora-2-pro $0.30 (until sunset)" },
    limits: { maxSeconds: 12 },
    status: "disqualified",
    tier: 4,
    verified: true,
    notes:
      "DO NOT BUILD ON. API discontinued 2026-09-24 (HTTP 410 after; no replacement). Consumer app already dead. Kept here to document the exclusion.",
    docs: "https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation",
  },
];

/** Look up one model by canonical id. */
export function getModel(id: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/** True if the model supports a capability. */
export function hasCapability(model: ModelEntry, cap: Capability): boolean {
  return model.capabilities.includes(cap);
}
