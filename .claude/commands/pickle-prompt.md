---
description: Build a model-ready image/video prompt with the macro-pickle Prompt Engine and (on export) save it to your prompt vault
argument-hint: "[--image|--video] [--brand <name>] [\"idea or JSON brief\"] [--save]"
allowed-tools: Bash(pnpm prompt *), Bash(pnpm run prompt *), Read, Write
---

# /pickle-prompt

Turn a rough idea into an engineered prompt using the Prompt Engine
(`scripts/lib/prompts/`) and the methodology in
`content/knowledge/PROMPT-COOKBOOK.md`. Image prompts use the Nano Banana
"Perfect Prompt" formula; video prompts use the Seedance/Veo "Director Brief".

## PROJECT RULE — exported prompts go to the vault

When a prompt is **finalized/exported** (the user wants to keep or use it), it
**must** be saved into your prompt vault as Obsidian-flavored markdown laid out for
copy-paste (the prompt body in a fenced ```text``` block). Two ways, both already
implemented — do not hand-roll a different format:

- CLI: append `--save` (and optionally `--title "…"`) →
  `exportPromptToVault` writes to `$MACRO_PICKLE_PROMPT_VAULT/<brand>/` (default `./exported-prompts/<brand>/`).
- MCP: pass `save: true` to `build_image_prompt` / `build_video_prompt`.

Destination override: `MACRO_PICKLE_PROMPT_VAULT`. A dry build (no `--save`) is
fine for iterating; the moment it's the keeper, save it.

## Usage

1. **Parse `$ARGUMENTS`.** Decide `--image` (default) or `--video`, and whether a
   `--brand` is named (list the installed profiles with `pnpm prompt --brands`).
2. **Turn the idea into a brief.** If the user gave prose, map it onto the brief
   fields (image: subject/action/context/composition/lighting/style/text; video:
   scene/subject/camera/beats/audio/pacing/intent). Apply cookbook rules:
   full sentences, exact text in quotes, IP-safe proxies, single-beat pacing,
   consistency clause for recurring characters.
3. **Build it:**
   ```bash
   pnpm prompt --image --brand <brand> --json '<ImageBrief>'
   pnpm prompt --video --brand <brand> --json '<VideoBrief>'
   ```
4. **Show the result** for review.
5. **On approval / "save it" / "export":** re-run with `--save --title "<name>"`
   (or just add `--save`). Report the vault path written.
6. **Image generation (optional):** add `--gen` to render the built prompt via
   Imagen 4.0 into `MACRO_PICKLE_EXPORT_DIR` (iCloud → phone). This calls a paid
   Google API — confirm before a live `--gen` run.

## Notes

- `pnpm prompt --brands` lists brand profiles (`content/brands/*.json`). Add a
  brand by dropping a new JSON file — no code change.
- Linting a storyboard scene: use the MCP `lint_scene` tool (IP-safety, single-beat,
  fixed-camera, stationary-cycle, atmospherics).
- Never put a copyrighted name in a final prompt — use the brand `cast` proxy.
