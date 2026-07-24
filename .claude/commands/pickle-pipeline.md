---
description: Run the macro-pickle reference→video media pipeline (scene:new → refs → curate → analyze → video)
argument-hint: "<scene-slug> [--from <stage>] [--dry-run]"
allowed-tools: Bash(pnpm scene:new*), Bash(pnpm scene:refs*), Bash(pnpm scene:select*), Bash(pnpm scene:analyze*), Bash(pnpm scene:video*), Bash(pnpm run *)
---

# /pickle-pipeline

Run the macro-pickle **reference → video** media pipeline: a two-stage, local,
**Supabase-free** flow that turns a rough idea into reference frames (Nano Banana),
lets you curate the keepers, then re-prompts those into video (Veo 3.1). Everything
writes to `pipeline-output/<scene-slug>/`; there is no database.

> Replaces the old Supabase **content-enrichment** pipeline (translate →
> generate-images → generate, `pickle.*` tables, `sync-approved-to-supabase`), which
> was removed with the CMS scaffold on 2026-06-29 (commit `2b1f250`). The code now
> lives in `scripts/pipeline/*.ts` + `scripts/lib/pipeline/*.ts` on the toolkit clients.

## Stages

1. **scene:new** — `pnpm scene:new <slug>` → scaffold `pipeline-output/<slug>/scene.json`
   (the recipe card: prompts + settings + a log of every file made).
2. **scene:refs** — `pnpm scene:refs <slug>` → **Stage 1**: the prompt enhancer rewrites
   your idea, then Nano Banana generates MANY candidate reference frames into
   `pipeline-output/<slug>/references/`.
3. **curate (human gate)** — `pnpm scene:select <slug> <ids>` → YOU pick the keeper frame
   ids that advance to video.
4. **scene:analyze** — `pnpm scene:analyze <slug>` → the vision analyzer "looks at" the
   keepers and grounds what it sees into the video prompt.
5. **scene:video** — `pnpm scene:video <slug>` → **Stage 2**: the keepers become video
   (Veo 3.1) as ingredients / first-last frames, written to `pipeline-output/<slug>/video/`.

## The curation gate (why this isn't one button)

Stages 1–2 automate; **stage 3 (select) needs you** to eyeball the candidates and choose
ids. So this command runs `new → refs`, then **STOPS** for curation. Re-invoke with
`--from analyze` (after `pnpm scene:select`) to finish `analyze → video`.

## Arguments

`$ARGUMENTS`:
- `<scene-slug>` — required; the scene folder name.
- `--from <stage>` — resume at `refs` | `analyze` | `video` (e.g. after curating).
- `--dry-run` — print the enhanced prompt + planned commands without spending.

## Execution

1. Parse `$ARGUMENTS`; default first run = `new → refs`, then stop at the curation gate.
2. Confirm the working dir is the macro-pickle root (its `package.json` defines the
   `scene:*` scripts) — all paths are local; **no Supabase / no env beyond `GOOGLE_API_KEY`**.
3. `scene:refs` and `scene:video` call paid-eligible Google APIs (Nano Banana + Veo) and
   Veo is **free-tier daily-quota limited** (429 `RESOURCE_EXHAUSTED` when tapped). Treat a
   live run as spend-relevant: unless the user asked for it (vs `--dry-run`), confirm first.
4. Run each selected stage as one Bash call. On non-zero exit → **STOP**, surface the output
   verbatim, and tell the user how to resume (`--from <stage>`).
5. At the curation gate, list the candidate ids/paths and tell the user to run
   `pnpm scene:select <slug> <ids>` then re-invoke `/pickle-pipeline <slug> --from analyze`.
6. After `scene:video`, print where the `.mp4`(s) landed.

## Notes

- Local-first: outputs live in `pipeline-output/<slug>/` (gitignored). Re-running a stage
  appends to the scene log in `scene.json`.
- Full docs: `docs/media-pipeline.md` and the Obsidian vault
  `Technical/Macro-Pickle-Pipeline/` (START HERE).
- For one-off model rails outside the scene flow, use `pnpm img|nano|veo|kling|fal`; for
  prompt-only building use `/pickle-prompt`; for short-form selling content use `/pickle-ugc`.
