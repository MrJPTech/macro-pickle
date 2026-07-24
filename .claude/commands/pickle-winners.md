---
description: Rank a store's SKUs by sales (manifest demand signal) → top-N shortlist for clip generation
argument-hint: "[--store <media-dir>] [--top N] [--ids] [--all]"
allowed-tools: Bash(pnpm rank-skus*), Bash(pnpm gen-clips*), Bash(pnpm run *)
---

# /pickle-winners

Rank a store's SKUs by **SALES** (the 1688 booked-count demand signal) via `pnpm rank-skus`
(`scripts/rank-skus.ts`) so a generation run targets the proven winners instead of every SKU.
**Read-only, zero API calls** — always safe to run.

## Usage

1. **Rank:** `pnpm rank-skus --store <media-dir> --top <N>` → a ranked table
   (clip-ready gen5 SKUs only by default; add `--all` to include SKUs with no gen5 set).
   `--store` is required (or set `MACRO_PICKLE_STORE_DIR`).
2. **Read the elbow:** there's usually a clear sales drop-off — recommend the cut to the user
   (e.g. "top 8 = the Pareto winners") rather than an arbitrary N.
3. **Hand off to clips:**
   `pnpm rank-skus --store <dir> --top <N> --ids` → CSV of winner SKU ids →
   `pnpm gen-clips --store <dir> --skus <csv>` (or run **/pickle-clips** with that `--skus`).

## Notes

- Demand signal = `manifest.json` `sales` per `offerId`. Requires the store dir to contain
  `manifest.json` + `<category>/<sku>/gen5/`.
- `--json` for machine output; `--ids` for the bare CSV (the pipe to `gen-clips --skus`).
- This is the front half of the money loop: **rank winners → /pickle-clips → cull in edit →
  post**. It does not spend anything; the spend gate lives in /pickle-clips.
