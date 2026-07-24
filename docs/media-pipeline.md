# Local Media Pipeline (reference → video)

A local, no-database toolkit that mirrors the validated creative workflow:

1. **Stage 1 — reference frames**: generate *many* candidate images with Nano
   Banana Pro / Nano Banana 2, then curate down to a handful.
2. **Stage 2 — video**: feed the curated frames into Veo 3.1 as *ingredients*
   or *first + last frame*, with the prompt grounded in what the frames show.

Everything is saved to disk under `pipeline-output/<slug>/` (gitignored). No
Supabase, no cloud storage. Runs on your existing `GOOGLE_API_KEY` ($0 with
Google Ultra).

## Models

| Stage | Alias | Model ID |
|-------|-------|----------|
| Image | `nano-banana-pro` | `gemini-3-pro-image` |
| Image | `nano-banana-2` | `gemini-3.1-flash-image` |
| Image | `nano-banana` | `gemini-2.5-flash-image` |
| Video | `veo-3.1` | `veo-3.1-generate-preview` |
| Video | `veo-3.1-fast` | `veo-3.1-fast-generate-preview` |

Set a raw model id directly in `scene.json` to override an alias.

## Commands

```bash
pnpm scene:new    <slug> --title "..." [--preset streetwear-product]  # scaffold scene.json
pnpm scene:refs   <slug> [--count N] [--no-enhance] [--dry-run]
pnpm scene:select <slug>                                # list candidates
pnpm scene:select <slug> ref_abc ref_def                # pick keepers (id or filename)
pnpm scene:select <slug> --clear                        # reset selection
pnpm scene:analyze <slug> [--prompt]                    # analyze selected frames
pnpm scene:analyze --image look.jpg [--prompt]          # analyze ANY image → reference prompt
pnpm scene:video  <slug> [--no-enhance] [--no-vision]
```

**Style presets** (prefill art direction on `scene:new --preset <name>`):
`streetwear-product`, `editorial-portrait`, `cinematic-scene`, `character-mascot`,
`social-vertical`. Defined in `scripts/lib/pipeline/style-presets.ts`.

**Prompt `kind`** (per reference prompt in scene.json): `general` | `character` |
`scene` | `keyframe` — selects category-specific exemplars + guidance in the
enhancer (e.g. `character` locks identity attributes; `keyframe` composes an
explicit start/end frame for Veo interpolation).

**Reverse loop** — `scene:analyze --image <file> --prompt` reads a look you already
like (real photo, mood-board frame) and emits a ready-to-use Stage-1 reference
prompt. That's the image → understanding → *first prompt* direction.

## Workflow

```
pnpm scene:new desk-lamp-hero --title "Desk Lamp Hero"
#   edit pipeline-output/desk-lamp-hero/scene.json
#   -> write reference prompt(s), set style/aspect/negativePrompt, count

pnpm scene:refs desk-lamp-hero          # generates N candidates per prompt
#   browse pipeline-output/desk-lamp-hero/references/

pnpm scene:select desk-lamp-hero                    # see ids
pnpm scene:select desk-lamp-hero ref_xxx ref_yyy    # keep the winners

#   edit scene.json -> write the video prompt(s), set useSelectedAs
pnpm scene:video desk-lamp-hero         # -> pipeline-output/.../video/*.mp4
```

## scene.json

```jsonc
{
  "slug": "desk-lamp-hero",
  "title": "Desk Lamp Hero",
  "reference": {
    "model": "nano-banana-pro",
    "aspectRatio": "16:9",
    "style": "graffiti streetwear product photography",
    "negativePrompt": "blurry, distorted text, extra fingers",
    "enhance": true,                 // CoT prompt enhancer before generating
    "prompts": [
      { "id": "rp_...", "text": "hot-pink graffiti cannabis box on black", "count": 6 }
    ]
  },
  "video": {
    "model": "veo-3.1",
    "aspectRatio": "16:9",
    "resolution": "1080p",
    "generateAudio": true,
    "enhance": true,
    "useSelectedAs": "ingredients",  // "ingredients" | "firstLast" | "firstFrame"
    "groundWithVision": true,        // analyze frames -> ground the prompt
    "prompts": [
      { "id": "vp_...", "text": "the box slowly rotates to show all sides" }
    ]
  },
  "media": []                        // generated frames + clips recorded here
}
```

## How the prompting works

- **Enhancer** (`scripts/lib/pipeline/prompt-enhancer.ts`): a Gemini chain-of-thought
  rewriter modeled on the Hunyuan PromptEnhancer (CVPR 2026), with few-shot
  exemplars in `prompt-exemplars.ts`. Turns a rough idea into a dense,
  structured prompt. Add your own brand exemplars to bias house style.
- **Vision grounding** (`scripts/lib/pipeline/vision-analyzer.ts`): before Stage 2,
  the *selected* frames are run back through Gemini multimodal (caption, on-image
  text/OCR, subject features, palette). That summary is injected into the video
  prompt so the motion stays on-subject — the image → understanding → prompt
  feedback loop.

`useSelectedAs` modes:
- `ingredients` — up to 3 frames guide subject/scene appearance (Veo picks motion)
- `firstLast` — frame 1 = start, frame 2 = end (transition)
- `firstFrame` — single image-to-video

## Reference

- Hunyuan PromptEnhancer (rewriting methodology): https://github.com/Hunyuan-PromptEnhancer/PromptEnhancer
- Nano Banana / Imagen image gen: https://ai.google.dev/gemini-api/docs/image-generation
- Veo 3.1 (reference images, first/last frame): https://ai.google.dev/gemini-api/docs/video
