---
description: Edit or generate video conversationally with Gemini Omni Flash (reference-video manipulation, multi-turn refinement)
argument-hint: "<what to change/create> [--video <ref.mp4>] [--image <refs>] [--continue <id>]"
allowed-tools: Bash(pnpm omni*), Bash(pnpm run *), Read, Glob
---

# /pickle-edit

Conversational video generation + **editing** via `pnpm omni` (`scripts/generate-omni.ts`
→ `scripts/lib/omni.ts`, model `gemini-omni-flash-preview`). The headline use: take a
reference video, describe the change in plain language ("replace the mug with our box",
"make it golden hour", "remove the watermark person"), get an edited MP4 back. Chain
refinements turn-by-turn with `--continue <interaction-id>` — no re-describing the scene.

## Usage

1. **Parse `$ARGUMENTS`** into a `pnpm omni` invocation:
   - Edit a reference clip: `pnpm omni --video "<ref.mp4>" --prompt "<change>"`
   - Generate fresh: `pnpm omni --prompt "<scene>"` (add `--image <p1,p2>` for subject/product lock)
   - Refine the last result: `pnpm omni --continue <interaction-id> --prompt "<next change>"`
   - Pass through `--aspect 16:9|9:16`, `--duration <e.g. 8s>`, `--name`, `--out`, `--task`.
2. **Prompt quality**: for fresh generations, build the prompt with the Prompt Engine
   (`--file <brief.json> --brand <name>`) or `/pickle-prompt` first. For edits, a plain
   imperative sentence is correct — the model has the source video as context.
3. **Always print the interaction id** from the output back to the user — it's the handle
   for the next conversational edit.
4. `--dry-run` prints the prompt + cost estimate without calling the API.

## SPEND (paid model — know before you run)

- **No free tier** (unlike Imagen/Gemini text): ~**$0.10/second of output video** (720p,
  $17.50/1M tokens at 5792 tok/s). 8s clip ≈ **$0.81**; each `--continue` refinement is a
  fresh render at the same rate. Input video is cheap (~$0.009/s); ref images ~$0.003 each.
- Verified live 2026-07-01 on the project `GOOGLE_API_KEY` — generation **and** multi-turn
  editing both work on this key. The CLI prints an estimate before every run.
- Track monthly spend at https://ai.studio (spend cap applies; `withRetry` classifies
  cap/quota errors and aborts cleanly).

## Model limits (API, 2026-07)

- One reference video max; clips ≤3s misprocess — use ≥4s sources. No audio refs.
- No negative prompts, temperature, or system instructions (the prompt is everything).
- Editing UPLOADED videos is unavailable in EEA/CH/UK (model-generated edits fine).
- Output is SynthID-watermarked. 720p; 16:9 or 9:16.

## When to use which video rail

| Need | Rail |
|------|------|
| Manipulate/edit an existing clip, iterate conversationally | **`pnpm omni`** (this) |
| Fresh clip from curated reference frames (free quota) | `pnpm veo` / `scene:video` |
| i2v with start+end frame lock, native audio | `pnpm kling` (fal.ai) |
| Batch store clips | `/pickle-clips` |

The scene pipeline can also route Stage 2 through Omni: set `"model": "omni-flash"` in
`scene.json` → `pnpm scene:video <slug>` (frames become reference images; paid).

## Notes

- Output goes wherever the user chooses: `--out "~/Pictures"` renders into any
  local folder; set `MACRO_PICKLE_OMNI_DIR` in `.env.local` to make that the default.
  Fallback: `MACRO_PICKLE_EXPORT_DIR/omni-clips/` (iCloud → phone), then `./omni-clips`.
- IP-safety rules still apply: never a copyrighted name in the prompt — use brand `cast`
  proxies (see `/pickle-prompt`).
