---
description: Turn a product (photo + benefit) into faceless short-form UGC selling prompts — clean hero still, lifestyle still, and a 9:16 spot — and save them to your prompt vault
argument-hint: "[product idea or id] [--format <key>] [--photos <dir>] [--describe <img>] [--generate]"
allowed-tools: Bash(pnpm describe *), Bash(pnpm run describe *), Bash(pnpm analyze-video *), Bash(pnpm prompt *), Bash(pnpm run prompt *), Read, Write
---

# /pickle-ugc

Build faceless **short-form UGC** that sells a product — the selling layer over the
Prompt Engine (`scripts/lib/prompts/ugc.ts`). Methodology: `content/knowledge/PROMPT-COOKBOOK.md`
§14. Selling craft: the `ugc-shortform-prompting` skill.

## Exported prompts go to the vault

Finalized prompts are saved to your prompt vault as copy-paste Obsidian markdown via
`exportPromptToVault` (the pack script does this for every product). Do not hand-roll a
different format. Destination override: `MACRO_PICKLE_PROMPT_VAULT`.

## The one rule: faceless

Product + hands + on-screen captions + music/VO — **no face in frame**. It's the house
format and it removes identity-lock / IP cost. Hook the product in the first 3 seconds.

## Usage

1. **Parse `$ARGUMENTS`.** Identify the product, the `--format` (default `faceless-finds`;
   also `unboxing`, `problem-solution`, `demo`, `before-after`, `listicle`, `tutorial`),
   and whether a real photo is involved.
2. **(Optional) Parse a real supplier photo** — OCR foreign text + get an in-use scene:
   ```bash
   pnpm describe --image <photo> --brand "Quiet Desk Co. (premium desk objects)"
   ```
3. **Build the spot** via the MCP `build_ugc_spot` tool (or `buildUgcSpot` from
   `scripts/lib/prompts/ugc.ts`), passing the product id, name, benefit verb-phrase,
   scene, and `--format`. Set `save: true` to write the notes.

   For a recurring catalog, write a small pack script that holds a `PRODUCTS` array and
   loops `buildUgcSpot` over it — that keeps ids, benefits, and scenes in one place and
   makes the whole set re-runnable.
4. **Each product yields 3 vault notes:** clean hero still, faceless lifestyle still, and a
   9:16 spot (hook→demo→CTA + caption track). Report the paths.
5. **Render pixels (optional, paid):** add `--generate` to render the stills via Imagen /
   Nano Banana into `MACRO_PICKLE_EXPORT_DIR`. **Confirm before any live `--generate`** — it
   calls a paid Google API. Paste the 9:16 SPOT briefs into Google Flow / Veo; burn captions
   in post.

## Notes

- **New store** = drop `content/brands/<store>.json` (faceless: `aspect: "9:16"`, no `cast`)
  and reuse the same commands. Example: `content/brands/quiet-desk.json`.
- **Mirror a competitor's clip:** `pnpm analyze-video --video <ref.mp4> --goal "<product>"`.
- **Long-form footage → clips:** hand off to the `opus-clip-automation` skill, not here.
- Captions are a POST overlay — the editor burns them in; the model makes clean footage.
