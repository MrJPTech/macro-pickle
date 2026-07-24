---
description: Clean/regenerate a product's gen5 reference set (studio + lifestyle) with true-scale anchors, backing up originals
argument-hint: "<gen5-dir> [\"product description\"] [--scale \"size phrase\"]"
allowed-tools: Bash(pnpm nano*), Bash(pnpm run nano*), Bash(cp*), Bash(mkdir*), Bash(ls*), Bash(ffmpeg*), Read
---

# /pickle-ref

Regenerate a product's reference frames when the studio shot is messy, off-brand, or — the
most common case — **causes Veo to OVERSIZE the product in clips**. Isolated white-background
studio refs carry no scale cue, so a palm-sized tin renders bucket-sized in a scene. This is
the reference-level fix; it pairs with the per-SKU `_scale` anchor in the clip scenes config.

## Workflow (proven on the mosquito balm jar, 2026-06-30)

1. **Look at the current refs** — `studio_01..03` + `life_01..02` in the gen5 dir (extract a
   frame / open the PNGs; downscale >2000px with ffmpeg before viewing).
2. **Regenerate clean STUDIO refs** via nano, feeding the OLD refs to keep identity:
   ```bash
   pnpm nano --prompt "<clean SINGLE product, explicit true scale + form factor, pure white seamless, soft studio light, no text/logos>" \
     --refs "<gen5>/studio_01.png,<gen5>/studio_02.png,<gen5>/studio_03.png" \
     --model 2 --aspect 1:1 --size 2K --count 2 --out "<review-dir>"
   ```
   Generate 2–3 consistent angles for a clean ASSET set. **Review every one** before installing.
3. **Regenerate LIFESTYLE refs** the same way, but **in-scene with explicit scale objects**
   (pinecones, a coin, pine needles, normal-sized props) — lifestyle frames are where scale
   context belongs (you can't put scale objects in the clean ASSET studio refs).
4. **Back up originals, then install:**
   ```bash
   mkdir -p "<gen5>/_orig-<desc>"
   cp "<gen5>"/studio_0*.png "<gen5>"/life_0*.png "<gen5>/_orig-<desc>/"   # backup
   cp "<review>/<keeper>.png" "<gen5>/studio_01.png"   # …install the keepers
   ```
   **Never overwrite gen5 originals without a backup.**
5. **Re-render the clip** — `/pickle-clips --skus <sku>` once Veo quota is open (Flow now, or
   API on reset), and add a `_scale` entry for the SKU in `content/clip-scenes/<store>.json`.

## Why white-bg refs oversize

Veo's ASSET lock preserves **appearance, not real-world scale**. Fix at three layers:
(a) a clean ref with an unambiguous form factor, (b) the per-SKU `_scale` phrase in the clip
scenes config, (c) in-frame scale objects in the lifestyle frames.

## SPEND / QUOTA

- `pnpm nano` (image gen) is its **own quota** — it usually works even when **Veo is 429'd**.
  Confirm before bulk regeneration. Supabase-free; outputs to a review dir, never straight
  over the originals.
