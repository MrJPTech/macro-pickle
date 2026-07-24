# macro-pickle — AI Creative Tooling

## Project Overview

Local, **database-free** AI creative toolkit — image & video generation plus a typed, brand-aware **Prompt Engine**, driven through Claude (CLI scripts, a desktop MCP server, and Claude Code skills/commands). There is **no database and no web app**: every rail writes files to disk, and finalized prompts are exported as copy-paste markdown into a notes vault of your choosing.

> Brand profiles and campaign prompt packs are intentionally NOT in this repo — it ships
> one worked example (`quiet-desk`) and stays brand-agnostic. Keep your own brands in a
> private directory and point `MACRO_PICKLE_BRANDS_DIR` at it.

## Technology Stack

| Layer | Technology |
|-------|------------|
| Language / runtime | TypeScript (strict, ESM) on Node via `tsx` |
| Image / video | `@google/genai` ≥2.x (Gemini vision · Imagen · Veo · Nano Banana · **Omni Flash** video editing) · `@fal-ai/client` (FLUX et al. · Kling) |
| MCP | `@modelcontextprotocol/sdk` (desktop `macro-pickle-images` server) |
| Validation | `zod` |
| Optional OCR sidecar | Python + PaddleOCR (`scripts/py/`, opt-in) |
| Package Manager | pnpm |

## Common Commands

```bash
pnpm install
cp .env.example .env.local      # add GOOGLE_API_KEY + FAL_KEY
pnpm lint                       # tsc --noEmit (type-check the whole toolkit)

# Prompts
pnpm prompt --brands            # list brand profiles
pnpm prompt --image --brand quiet-desk --json '{"subject":"lamp hero shot"}' --save

# Image generation
pnpm img "neon pickle mascot"   # Imagen 4.0 → MACRO_PICKLE_EXPORT_DIR
pnpm fal --model flux-pro "…"   # fal.ai (FLUX / Recraft / Ideogram / SD3.5)
pnpm nano                       # Nano Banana face-lock from reference photos

# Video generation
pnpm veo                        # Google Veo (t2v / i2v / --refs ASSET lock)
pnpm kling                      # Kling via fal.ai (i2v / t2v / start+end)

# Video EDITING — Gemini Omni Flash (PAID, ~$0.10/s output; no free tier)
pnpm omni --video ref.mp4 --prompt "…"    # manipulate a reference video in plain language
pnpm omni --continue <id> --prompt "…"    # chain conversational refinements (multi-turn)
pnpm omni --prompt "…" --dry-run          # prompt + cost estimate, no API call

# Media pipeline (two-stage: idea → reference frames → curate → video)
pnpm scene:new <slug>           # scaffold a scene.json
pnpm scene:refs <slug>          # Stage 1: generate reference frames
pnpm scene:select <slug> <ids>  # curate the keepers
pnpm scene:video <slug>         # Stage 2: selected frames → video (scene.json "model": "omni-flash" routes via Omni, paid)

# Store batch clips (gen5 product refs → clips), spend-gated + resume-safe
pnpm rank-skus --store <dir> --top 8 --ids   # rank a store's SKUs by sales → top-N ids
pnpm gen-clips --store <dir> --dry-run       # generic batch (Veo free + Kling paid); dry-run first
pnpm gen-clips --store <dir> --yes           # live paid run (ENFORCED: --yes + --max-spend cap; existing clips skipped)
#   per-store tuning lives in content/clip-scenes/<store>.json (see example-store.json)

# Vision / UGC
pnpm describe                   # Gemini: product OCR + in-use scene rec (--paddle for sidecar)
pnpm analyze-video              # describe a reference clip
pnpm mcp:image                  # run the desktop MCP server
```

## Environment Setup

```bash
cd /path/to/macro-pickle
cp .env.example .env.local
# Fill in GOOGLE_API_KEY + FAL_KEY (gitignored, never committed)
pnpm install
```

Environment variables (see `.env.example`):
- `GOOGLE_API_KEY` — Gemini + Imagen + Veo + Nano Banana
- `FAL_KEY` — fal.ai (Kling video + FLUX image models)
- `MACRO_PICKLE_EXPORT_DIR` *(optional)* — where generated images/clips land; defaults to `./generated-images`. Point it at a synced folder to review on a phone.
- `MACRO_PICKLE_OMNI_DIR` *(optional)* — default output folder for `pnpm omni` video edits (any local dir); `--out` overrides per run
- `MACRO_PICKLE_PROMPT_VAULT` *(optional)* — where `--save` writes prompt notes; defaults to `./exported-prompts`
- `MACRO_PICKLE_BRANDS_DIR` *(optional)* — where brand profiles load from; defaults to `content/brands`
- `MACRO_PICKLE_STORE_DIR` *(optional)* — default `--store` for `pnpm rank-skus` / `pnpm gen-clips`
- `MACRO_PICKLE_PYTHON` / `MACRO_PICKLE_PADDLE_MKLDNN` *(optional)* — PaddleOCR sidecar config

## Architecture

Each rail is a self-contained CLI in `scripts/` backed by a generation core in `scripts/lib/`; the MCP server (`mcp/image-server/`) and Claude Code skills/commands wrap the same cores. Nothing touches a database.

```
brand profile (content/brands/*.json) + brief (content/briefs/*.json)
    → Prompt Engine (scripts/lib/prompts/)   → model-ready image/video prompt
    → generation core (imagen · fal · veo · kling · nano-banana)
    → image/video file on disk (MACRO_PICKLE_EXPORT_DIR)
    → finalized prompt → exportPromptToVault → $MACRO_PICKLE_PROMPT_VAULT/<brand>/
```

## Key Directories

- `scripts/` — rail CLIs (`pnpm img/fal/nano/veo/kling/omni/describe/ocr/analyze-video`) + batch rails (`gen-clips.ts`, `rank-skus.ts`)
- `scripts/lib/` — generation cores: `imagen.ts`, `fal.ts`, `veo.ts`, `kling.ts`, `omni.ts`, `nano-banana.ts`, `vision.ts`, `paddleocr.ts`
- `scripts/lib/prompts/` — the Prompt Engine (builders, brand, scene, export, ugc, lint)
- `scripts/py/` — optional PaddleOCR sidecar
- `mcp/image-server/` — `macro-pickle-images` desktop MCP server
- `content/brands/` — brand profiles (`quiet-desk` = worked example) · `content/briefs/` — scene briefs (`example-logo/`) · `content/clip-scenes/` — batch configs (`example-store.json`) · `content/knowledge/` — PROMPT-COOKBOOK.md
- `.claude/skills/` (`openmontage-video-prompting`, `ugc-shortform-prompting`, `character-lock`) · `.claude/commands/` — prompt: `/pickle-prompt`; UGC: `/pickle-ugc`; scene pipeline: `/pickle-pipeline`; batch clips: `/pickle-winners` → `/pickle-clips`; references: `/pickle-ref`; vision: `/pickle-describe`; character lock: `/pickle-character`; brand onboarding: `/pickle-brand`; video editing: `/pickle-edit` (Omni Flash)

## Key Patterns

1. **Local-first**: every rail writes files to disk; no DB, no web app
2. **Prompt Engine over raw strings**: use `buildImagePrompt`/`buildVideoPrompt`, never hand-write prompts
3. **Brand profiles are the source of style**: `content/brands/*.json` (palette/prefer/avoid/cast) auto-applied via `--brand`
4. **Shared cores**: CLI, MCP, and skills all call the same `scripts/lib/` modules — no divergence
5. **Vault export convention**: finalized prompts go through `exportPromptToVault` (see below)

## Prompt Engine & Scene Creation

The executable prompting subsystem lives at `scripts/lib/prompts/` (DB-free).
Methodology is documented in `content/knowledge/PROMPT-COOKBOOK.md` (synthesized
from a fleet of reference repos). Use it instead of hand-writing raw prompt strings.

- **Image prompts** — Nano Banana "Perfect Prompt" formula via `buildImagePrompt`.
- **Video prompts** — Seedance/Veo "Director Brief" via `buildVideoPrompt`.
- **Brand profiles** — `content/brands/<name>.json` (style/palette/prefer/avoid/
  suffix/cast); auto-applied via `brief.brand`. List: `pnpm prompt --brands`.
- **Scene linting** — `lintScene` (IP-safety, single-beat, fixed-camera,
  stationary-cycle, atmospherics).
- **UGC / short-form selling** — `scripts/lib/prompts/ugc.ts`: faceless "finds" content
  forms (`UGC_FORMATS`) turn a product into a clean hero still + faceless lifestyle still
  + 9:16 spot (hook→demo→CTA + caption track). `describeProduct` (`scripts/lib/vision.ts`)
  does OCR + in-use scene rec (Gemini; opt into the local **PaddleOCR** sidecar via
  `--paddle` / `paddleOcr:true` for high-recall small/CJK text + geometry in `ocr_*` fields —
  needs Python+paddleocr, non-fatal if absent); `describeReferenceVideo` mirrors a reference clip. The
  selling layer above the `openmontage-video-prompting` cinematography skill; see the
  `ugc-shortform-prompting` skill + PROMPT-COOKBOOK §14. Long-form footage → the
  `opus-clip-automation` skill, not here.
- **CLI** — `pnpm prompt`, `pnpm describe`, `pnpm ocr` (PaddleOCR sidecar),
  `pnpm analyze-video`.
  **MCP** (`macro-pickle-images`) — `build_image_prompt`, `build_video_prompt`,
  `describe_product`, `build_ugc_spot`, `analyze_reference_video`, `lint_scene`,
  `generate_image`. **Commands** — `/pickle-prompt`, `/pickle-ugc`, `/pickle-pipeline`
  (scene:*), `/pickle-winners` + `/pickle-clips` (rank winners → batch clips),
  `/pickle-ref` (clean references), `/pickle-describe` (OCR + scene rec),
  `/pickle-character` (face-lock), `/pickle-brand` (new brand profile),
  `/pickle-edit` (Omni Flash conversational video editing).
- **Local OCR sidecar (optional)** — `scripts/py/paddleocr_ocr.py` driven by
  `scripts/lib/paddleocr.ts` (`runPaddleOcr`). Opt-in CJK/small-text OCR + per-line
  geometry that *complements* the Gemini rail (never replaces it). Install with
  `pip install -r scripts/py/requirements.txt`, point `MACRO_PICKLE_PYTHON` at that
  Python. `detected_text` stays Gemini's; PaddleOCR fills the separate `ocr_*` fields —
  **nothing downstream consumes those yet**, so `--paddle` lays the rail (data + geometry
  for future in-place watermark masking) but does NOT change generated output today.
  If inference throws a oneDNN/PIR `NotImplementedError` on your paddle build, set
  `MACRO_PICKLE_PADDLE_MKLDNN=0` (the sidecar auto-falls-back, but this skips a wasted
  ~2× model load per image). The bridge spawns one Python process per image — fine for
  ad-hoc use; true high-volume OCR would want a persistent/batch worker (not built).

### Convention: exported prompts go through `exportPromptToVault`

Whenever a prompt is **finalized/exported** for use, save it via `exportPromptToVault`
(`scripts/lib/prompts/export.ts`) rather than inventing a different format. It writes
Obsidian-flavored markdown laid out for copy-paste (prompt body in a fenced ```text```
block, source brief in a collapsed callout):
- CLI: `pnpm prompt … --save [--title "…"]`
- MCP: `save: true` on `build_image_prompt` / `build_video_prompt`
- Destination: `$MACRO_PICKLE_PROMPT_VAULT/<brand>/`, defaulting to
  `./exported-prompts/<brand>/`.

**Never put a copyrighted name in a final prompt** — use the brand `cast` proxy.
Likewise, only lock likenesses you have the rights to use.
