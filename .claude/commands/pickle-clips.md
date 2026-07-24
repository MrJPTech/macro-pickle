---
description: Batch reference→video clips for a store's gen5 SKUs (Veo free + Kling paid), spend-gated
argument-hint: "--store <media-dir> [--skus a,b,c] [--veo-only] [--limit N] [--dry-run] [--yes]"
allowed-tools: Bash(pnpm gen-clips*), Bash(pnpm rank-skus*), Bash(pnpm run *)
---

# /pickle-clips

Batch-generate product clips from a store's gen5 reference sets via `pnpm gen-clips`
(`scripts/gen-clips.ts`). Per SKU: **2 Veo ASSET-lock scene variants (FREE)** + **1 Kling
studio→lifestyle reveal (paid)**. Generic — point it at any
`<store>/<category>/<sku>/gen5/{studio_01..03,life_01..02}.png` layout with a scenes config.
Supabase-free.

## Usage

1. **Parse `$ARGUMENTS`** — `--store <media-dir>` is required; pass through
   `--skus / --veo-only / --kling-only / --limit / --model / --aspect / --out / --no-audio / --force`.
2. **ALWAYS dry-run first** (zero API):
   `pnpm gen-clips --store <dir> --dry-run` → confirm SKU count, clip count, and Kling cost.
3. **Scenes config** — gen-clips loads `content/clip-scenes/<basename(store)>.json`
   (per-category Veo pair + Kling reveal + `_scale` per-SKU size anchors + optional
   `_suffix` style override). If absent it warns and uses generic scenes — author one for
   a new store by copying `content/clip-scenes/example-store.json`.
4. **Free pass first:** `--veo-only` ($0). Only run the Kling pass after confirming spend.
5. **The spend gate is ENFORCED**: a paid Kling run aborts without `--yes`, and aborts if the
   estimate exceeds `--max-spend` (default $25, env `MACRO_PICKLE_MAX_SPEND_USD`). Only add
   `--yes` after the user has confirmed the dry-run cost.
6. **Re-runs are resume-safe**: clips whose output already exists are skipped (no double
   spend); `--force` regenerates.

## SPEND + QUOTA (hard-won — bake into every run)

- **Veo is "free" only on the `GOOGLE_API_KEY` quota, and the FREE tier is daily-rate-limited**
  (~10 gens/day → `429 RESOURCE_EXHAUSTED` when tapped). **Image quota is SEPARATE** (image
  gen can still work while Veo is tapped). For real volume: **Google Flow** (Ultra account) or
  **enable billing** on the key's GCP project (Veo 3.1 Fast ≈ $0.10/s 720p · $0.12 1080p ·
  default 8s ≈ $0.80–0.96/clip, billed only on success).
- **Kling = real fal.ai money** — 2.6 Pro i2v is $0.14/s with audio ($0.70/5s clip),
  $0.07/s without (`--no-audio`); verified fal pricing 2026-07, table in
  `scripts/lib/kling.ts`. Check the fal.ai balance before a `--kling`/full run.
  **Confirm with the user before any live paid spend** — then pass `--yes`.
- If a Veo daily-quota 429 hits mid-batch, the engine skips the remaining Veo clips
  automatically (Kling continues); re-run the same command tomorrow to resume.

## Pair with /pickle-winners

Generate only the proven sellers, not all SKUs:
`pnpm rank-skus --store <dir> --top 8 --ids` → paste the CSV into `--skus`.

## Notes

- Per-store tuning (scenes per category, `_scale` overrides, `_suffix`) lives in
  `content/clip-scenes/<store>.json`. Add one config per store you batch.
- Output → `MACRO_PICKLE_EXPORT_DIR/<store>-clips/`.
- IP-safe: scene prompts describe the **environment only**; product identity comes from the
  gen5 ASSET refs. The built-in suffix forbids duplicate/invented products and enforces
  true-to-life scale. If a small product still renders oversized, fix its reference with
  **/pickle-ref** and add a `_scale` entry to the store's clip-scenes config.
