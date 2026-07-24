---
description: Scaffold a new brand profile (content/brands/<name>.json) so the Prompt Engine + --brand work for a new store/client
argument-hint: "<brand-name> [\"style notes\"]"
allowed-tools: Bash(pnpm prompt --brands*), Bash(pnpm run *), Read, Write
---

# /pickle-brand

Create a new **brand profile** so the engine can style generations with `--brand <name>`.
No code change — the loader (`scripts/lib/prompts/brand.ts`) reads `content/brands/*.json`,
and every rail (`pnpm prompt|nano|img|fal`, the clip + UGC packs) honors it.

## Usage

1. **Survey existing:** `pnpm prompt --brands`, then read a close template
   (`content/brands/quiet-desk.json` is the worked example — a product brand with palette,
   prefer/avoid lists, and a style sentence).
2. **Write `content/brands/<name>.json`** with the real fields (match the existing profiles):
   - `name` — display name
   - `style` — the core look + voice, in a rich sentence
   - `palette` — array of named hex colors
   - `prefer` — array of must-haves
   - `avoid` — array of must-nots (garbled text, duplicate products, faces if faceless, etc.)
   - `promptSuffix` — short realism/quality tail appended to prompts
   - `aspect` — default ratio (e.g. `9:16`, `1:1`)
   - `cast` *(optional)* — IP-safe proxy names for any character/franchise the brand evokes
3. **Verify it loads:** `pnpm prompt --brands` lists the new name.
4. **Use it:** `pnpm prompt --image --brand <name> …`, `pnpm nano --brand <name> …`, or
   reference it from a clip scenes config.

## House rules

- **`cast` = IP-safe proxies only** — NEVER a copyrighted or real-person name in a final prompt.
- A store that will also generate **clips** wants a matching
  `content/clip-scenes/<store>.json` (per-category scenes) — see **/pickle-clips**.
- Brand profiles are data, not code — adding/editing one needs no build. Supabase-free.
