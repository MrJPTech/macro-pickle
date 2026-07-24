<div align="center">

# 🥒 macro-pickle

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=22&pause=1000&color=6366F1&center=true&vCenter=true&multiline=true&repeat=true&width=640&height=80&lines=Local+AI+Creative+Tooling+%7C+No+Database;Image+%2B+Video+Gen+%E2%9A%A1+Typed+Prompt+Engine;Gemini+%E2%80%A2+Imagen+%E2%80%A2+fal.ai+%E2%80%A2+Veo+%E2%80%A2+Kling" alt="Typing SVG" />

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Gemini](https://img.shields.io/badge/Gemini-Vision-8B5CF6?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![Imagen](https://img.shields.io/badge/Imagen-4.0-EC4899?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![fal.ai](https://img.shields.io/badge/fal.ai-FLUX_%2B_Kling-7C3AED?style=for-the-badge&logoColor=white)](https://fal.ai)
[![MCP](https://img.shields.io/badge/MCP-desktop_server-F59E0B?style=for-the-badge)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-A855F7?style=for-the-badge)](LICENSE)

[![PRSMTECH](https://img.shields.io/badge/maintained_by-PRSMTECH-6366F1?style=for-the-badge&labelColor=0C0C0C)](https://github.com/PRSMTECH)
[![MrJPTech](https://img.shields.io/badge/author-MrJPTech-6366F1?style=for-the-badge&labelColor=0C0C0C)](https://github.com/MrJPTech)

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="rainbow line" width="100%"/>

**🥒 Local, database-free AI creative tooling — image & video generation plus a typed, brand-aware Prompt Engine, driven through Claude. No database, no web app. Big dill. 🌶️**

</div>

## 👀 What it is

`macro-pickle` is a command-line + MCP toolkit for generating brand-aware imagery and video and for engineering the prompts behind them. There is **no database and no web app** — every rail writes files to disk, and finalized prompts are exported as copy-paste markdown you can drop into any notes vault.

It runs through Claude — CLI scripts via `tsx`, a desktop **MCP server**, and Claude Code **skills/commands** — with **Google** (Gemini vision, Imagen, Veo, Nano Banana) and **fal.ai** (FLUX et al., Kling video) as the generation backends.

## 🚦 Quick start (0 to pickle in 60 seconds 🏃💨)

**Prerequisites:** Node 20+, [pnpm](https://pnpm.io), and at least one API key.

```bash
git clone https://github.com/MrJPTech/macro-pickle.git
cd macro-pickle
pnpm install

cp .env.example .env.local        # then add your keys (see below)
pnpm lint                         # tsc --noEmit — verifies the install
pnpm prompt --brands              # list the installed brand profiles
pnpm img "a neon pickle mascot, dark studio bg"     # Imagen → PNG on disk
```

### 🔑 Keys

Everything is optional except the backend you actually use — nothing is required to *build* prompts, only to render pixels.

| Variable | Needed for | Get one |
|:---|:---|:---|
| `GOOGLE_API_KEY` | Gemini vision/OCR, Imagen, Veo, Nano Banana, Omni Flash | [ai.google.dev](https://ai.google.dev) |
| `FAL_KEY` | Kling video + FLUX / Recraft / Ideogram / SD3.5 images | [fal.ai](https://fal.ai) |
| `BYTEPLUS_API_KEY` · `RUNWAY_API_KEY` · `REPLICATE_API_TOKEN` | Optional extra video providers via the model registry | see [`.env.example`](.env.example) |

### 📁 Where output goes

All paths are yours to set — the defaults are all repo-relative, so a fresh clone works with no configuration.

| Variable | Default | What it controls |
|:---|:---|:---|
| `MACRO_PICKLE_EXPORT_DIR` | `./generated-images` | Where rendered images/clips land. Point it at a synced folder (iCloud/Drive/Dropbox) to review on your phone. |
| `MACRO_PICKLE_PROMPT_VAULT` | `./exported-prompts` | Where `--save` writes finalized prompt notes. Point it at an Obsidian/Logseq vault to collect them there. |
| `MACRO_PICKLE_OMNI_DIR` | falls back to export dir | Default output for `pnpm omni` video edits. |
| `MACRO_PICKLE_BRANDS_DIR` | `content/brands` | Where brand profiles are loaded from — keep private brands outside the repo. |

<details>
<summary><b>⚡ Scripts (buttons to mash 🎮)</b></summary>

| Command | What it does |
|:--------|:-------------|
| `pnpm prompt` | Build image/video prompts via the **Prompt Engine** (`--image`/`--video`, `--brand`, `--json`, `--save`, `--gen`) |
| `pnpm img` | Imagen 4.0 reference-image generation → `MACRO_PICKLE_EXPORT_DIR` |
| `pnpm fal` | fal.ai image models (FLUX / Recraft / Ideogram / SD3.5) — Prompt Engine parity |
| `pnpm nano` | **Nano Banana** face-lock generation from reference photos (likenesses you have rights to) |
| `pnpm veo` | Google **Veo** video — text-to-video, image-to-video, and `--refs` ASSET identity lock |
| `pnpm kling` | **Kling** video via fal.ai — i2v / t2v / start+end interpolation |
| `pnpm describe` | Gemini vision: product **OCR + in-use scene recommendation** (UGC rail); `--paddle` for the local OCR sidecar |
| `pnpm ocr` | Optional local **PaddleOCR** sidecar (high-recall small/CJK text + geometry) |
| `pnpm analyze-video` | Describe a reference/competitor clip for mirroring |
| `pnpm scene:new`/`refs`/`select`/`analyze`/`video` | **Media pipeline** — two-stage: text → reference frames → curate → re-prompt to video ([docs/media-pipeline.md](docs/media-pipeline.md)) |
| `pnpm rank-skus` · `pnpm gen-clips` | **Store batch clips** — rank a store's SKUs by sales → generic reference→video batch (Veo free + Kling paid), spend-gated |
| `pnpm omni` · `pnpm seedance` · `pnpm wan` | Gemini **Omni Flash** conversational video editing · Seedance · Wan video rails |
| `pnpm models` | Browse / select across the cross-provider video-model registry |
| `pnpm mcp:image` | Run the `macro-pickle-images` desktop **MCP server** |
| `pnpm lint` | Type-check the whole toolkit (`tsc --noEmit`) |

</details>

<details>
<summary><b>🎨 Prompt Engine (the secret sauce 🧪)</b></summary>

`scripts/lib/prompts/` turns the methodology in [`content/knowledge/PROMPT-COOKBOOK.md`](content/knowledge/PROMPT-COOKBOOK.md) (synthesized from a fleet of reference repos) into typed, deterministic builders — **no DB required**:

| Piece | What it does |
|:------|:-------------|
| `buildImagePrompt` | Nano Banana "Perfect Prompt" formula — Subject + Action + Context + Composition + Lighting + Style |
| `buildVideoPrompt` | Seedance/Veo "Director Brief" — Scene · Subject · Camera · Action · Audio · Pacing + time-segmented beats + on-screen captions |
| Brand profiles | `content/brands/*.json` — style, palette, prefer/avoid, suffix, IP-safe cast proxies; auto-applied via `--brand` |
| UGC layer | `scripts/lib/prompts/ugc.ts` — faceless short-form selling formats (hero still → lifestyle still → 9:16 spot) |
| `lintScene` | Continuity & IP-safety linter — single-beat, fixed-camera, stationary-cycle, atmospherics |

> 📓 **Export convention:** finalized prompts are written as copy-paste markdown — `pnpm prompt … --save`, or `save: true` on the MCP build tools. They land in `./exported-prompts/` unless you point `MACRO_PICKLE_PROMPT_VAULT` at a notes vault.

</details>

<details>
<summary><b>🎬 Media Pipeline — idea → references → video (the <code>scene:*</code> flow 🎞️)</b></summary>

The two-stage workflow at the heart of the toolkit: turn an idea into **reference images**, curate the winners, then **re-prompt them into video** — across Nano Banana / Imagen / Veo / Kling / Gemini. A local `scene.json` manifest tracks every prompt, frame, and clip ([full walkthrough](docs/media-pipeline.md)).

```bash
pnpm scene:new    my-scene        # scaffold scene.json (reference + video prompts)
pnpm scene:refs   my-scene        # Stage 1 — generate reference-frame candidates
pnpm scene:select my-scene <ids>  # curate the keepers
pnpm scene:analyze my-scene       # (optional) Gemini grounding of the picks
pnpm scene:video  my-scene        # Stage 2 — selected frames → Veo clip
```

| Piece | What it does |
|:------|:-------------|
| `scene-store` | Local JSON manifest — prompts, frames, selections, clips per scene |
| `PromptEnhancer` | Gemini chain-of-thought prompt rewriter (+ exemplar banks) that **directs** your idea |
| `groundFrames` | Image → understanding feedback loop — keeps Stage 2 on-subject / on-brand |
| Veo modes | `ingredients` (ASSET refs) · `firstLast` (first→last frame) · `firstFrame` (i2v) |

> Built on the **same `scripts/lib/` clients** as the rest of the toolkit — one set of model clients, no duplication.

</details>

<details>
<summary><b>🤖 MCP server, skills & commands (Claude's toolbelt 🛠️)</b></summary>

- **MCP** (`macro-pickle-images`, `pnpm mcp:image`) — exposes `build_image_prompt`, `build_video_prompt`, `describe_product`, `build_ugc_spot`, `analyze_reference_video`, `lint_scene`, `generate_image`, `generate_video` to Claude Desktop.
- **Skills** (`.claude/skills/`) — `openmontage-video-prompting` (cinematography), `ugc-shortform-prompting` (selling layer), `character-lock` (identity / face lock).
- **Commands** (`.claude/commands/`) — `/pickle-prompt` · `/pickle-ugc` · `/pickle-pipeline` (`scene:*`) · `/pickle-winners` → `/pickle-clips` (rank winners → batch clips) · `/pickle-ref` (clean references) · `/pickle-describe` (OCR + scene rec) · `/pickle-character` (face-lock) · `/pickle-brand` (new brand profile).

</details>

<details>
<summary><b>🛠️ Stack (what's under the hood 🏎️)</b></summary>

| Layer | Technology |
|:------|:-----------|
| Language / runtime | TypeScript (strict, ESM) on Node via `tsx` |
| Image / video | `@google/genai` (Gemini · Imagen · Veo · Nano Banana) · `@fal-ai/client` (FLUX · Kling) |
| MCP | `@modelcontextprotocol/sdk` |
| Validation | `zod` |
| Optional OCR sidecar | Python + PaddleOCR (`scripts/py/`, opt-in) |

</details>

<details>
<summary><b>📂 Layout (where the bodies are buried ⚰️🗺️)</b></summary>

```
macro-pickle/
├── scripts/
│   ├── lib/                # generation cores: imagen, fal, veo, kling, nano-banana, vision, paddleocr
│   │   ├── prompts/        # the Prompt Engine (builders, brand, scene, export, ugc, lint)
│   │   └── pipeline/       # scene-store + prompt-enhancer + exemplars + presets
│   ├── pipeline/           # scene:new/refs/select/analyze/video CLI
│   ├── generate-*.ts       # pnpm img / fal / nano / veo / kling
│   ├── build-prompt.ts     # pnpm prompt
│   ├── describe-product.ts · ocr.ts · analyze-video.ts   # vision / OCR rails
│   ├── gen-clips.ts · rank-skus.ts   # store batch-clip rails
│   └── py/                 # optional PaddleOCR sidecar
├── mcp/image-server/       # macro-pickle-images desktop MCP
├── content/
│   ├── brands/             # brand profiles (*.json) — `quiet-desk` is the worked example
│   ├── briefs/             # scene briefs — `example-logo/` shows the format
│   ├── clip-scenes/        # per-store batch-clip scene configs (`example-store.json`)
│   └── knowledge/          # PROMPT-COOKBOOK.md methodology
└── .claude/                # skills + slash commands
```

</details>

## 📜 License

MIT — see [LICENSE](LICENSE). Free as a pickle at a deli counter. 🥪

<img src="https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/rainbow.png" alt="rainbow line" width="100%"/>

<div align="center">

**🧑‍🍳 Lovingly brined by [MrJPTech](https://github.com/MrJPTech) · a [PRSMTECH](https://github.com/PRSMTECH) project**

**📅 Last Updated**: July 2026 · **Status**: 🎨 Local database-free creative toolkit — image + video gen, Prompt Engine, MCP · **Vibe**: kind of a big dill 🥒

[![Back to top](https://img.shields.io/badge/Back%20to%20Top-↑-6366F1?style=for-the-badge)](#-macro-pickle)

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%" />

</div>
