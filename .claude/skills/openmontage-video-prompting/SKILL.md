---
name: openmontage-video-prompting
description: >-
  Author high-control AI video-generation prompts using OpenMontage's canonical
  5-aspect spec and per-model vocabulary (Seedance 2.0, VEO 3.1, Sora 2, LTX-2,
  Grok, Hunyuan, Runway, Kling). Use whenever building or refining a VIDEO prompt
  in macro-pickle — storyboards, Director Briefs, scene packs, Flow/Veo/Seedance
  shots, or fixing a clip that drifts on motion, camera, or character identity.
  Complements the Prompt Engine (`scripts/lib/prompts/`) and `/pickle-prompt`.
metadata:
  type: creative-prompting
  source: LOGIC/repositories/OpenMontage (calesthio/OpenMontage, AGPL-3.0)
  layer: 2
---

# OpenMontage Video-Gen Prompting

Distilled from OpenMontage's `skills/creative/video-gen-prompting.md` and its
per-model guides (from the OpenMontage project).
This is the **control layer** on top of macro-pickle's existing Director Brief.
The Prompt Engine (`buildVideoPrompt` in `scripts/lib/prompts/video.ts`) renders
the structure; this skill teaches you what to put in each slot so the model
actually renders it.

> Read this BEFORE hand-writing a video prompt or filling a `VideoBrief`. It does
> not replace `/pickle-prompt` — it makes the brief you feed it far more precise.

## The one rule that matters most

VLM research (CMU/Harvard) shows generation models reliably render **subject** and
**scene** but routinely fail on **motion**, **spatial**, and **camera**. So the
highest-leverage habit is **forcing every prompt to fill all five aspects**:

```
[Subject]        type + 3–6 disambiguating visual attributes
[Subject Motion] actions in TEMPORAL order; subject↔object & subject↔subject interactions
[Scene]          overlays (listed separately!) + POV + setting + time-of-day + dynamics
[Spatial]        shot size + position-in-frame + depth (FG/MG/BG) + camera height — and how they CHANGE
[Camera]         speed → lens distortion → height → angle → focus/DoF → steadiness → movement
```

**Shorter prompt = more creative freedom. Longer prompt = more control.** Match
length to the model (below). A prompt is self-contained only if a reader who never
saw the shot could picture it from the text alone.

## Per-model length sweet spots

| Model | Sweet spot | Notes |
|---|---|---|
| **Seedance 2.0** | 200–400 w (hero), 80–150 w (insert) | macro-pickle's premium default; rewards long structured 5-aspect prompts, single-pass synced audio, multi-shot |
| Wan 2.2 | 200–400 w | fine-tuned on long captions |
| Sora 2 / VEO 3.1 | 100–250 w | plateaus past ~250 |
| LTX-2 | ≤ 80 w | degrades past that — keep tight |
| Runway Gen-4 | ≤ 60 w | "focus on motion, not appearance"; one scene per clip |
| Kling 2.6 | 4-part | supports `++emphasis++` syntax |

Full per-model component structures (VEO 14-component, Seedance 8-component, Sora
advanced fields, LTX audio prompting, Grok `<IMAGE_n>` carryover) live in
`LOGIC/repositories/OpenMontage/skills/creative/prompting/`. Open the matching file
when a shot targets that specific model.

## Camera — keep the three groups un-conflated

Models conflate translation, rotation, and lens-only changes. Name the group:

| Group | Primitives | Rule |
|---|---|---|
| **Translation** (camera moves) | dolly in/out, truck L/R, pedestal up/down | "dolly forward toward subject" |
| **Rotation** (camera pivots) | pan L/R, tilt up/down, roll CW/CCW | "pan right across the room" |
| **Lens-only** (no move) | zoom, rack focus, pull focus | "zoom in" ≠ "dolly in" |
| **Signature** | dolly-zoom (vertigo), arc/orbit, crane, whip-pan, tracking, handheld | use "vertigo" only at a revelation |
| **Stillness** | static, micro-shake, locked-off | **static is strict** |

- **dolly ≠ zoom** (translation vs focal length). **pan ≠ truck** (rotate vs slide).
- **Static is strict:** zero movement, zero focus change, zero zoom. If any occur,
  pick the real primitive instead of writing "static camera."
- **bird's-eye = strict top-down. aerial = altitude.** A 45° drone shot is a
  high-angle from aerial height, NOT bird's-eye.
- When DoF changes mid-shot, label start AND end focal plane (FG/MG/BG/out-of-focus).

Shot sizes: wide/establishing · full/long · medium · medium close-up · close-up ·
extreme close-up · OTS · POV · low-angle (powerful) · high-angle (vulnerable) ·
Dutch (unease).

## Lighting & lens (visual causes, not adjectives)

Lighting: natural · golden hour · high-key (comedy) · low-key (thriller) ·
Rembrandt · film noir · volumetric · backlight/silhouette · side · practicals ·
rim/edge. Modifiers: key/fill/bounce/rim/spill/negative-fill. Temp: warm/cool/mixed.

Lens: wide 24–35mm (exaggerated perspective) · telephoto 85mm+ (compressed,
isolated) · anamorphic (flares) · fisheye (strong curve) vs barrel (mild bow).

## Identity anchoring (multi-shot)

Models lose character identity across cuts. In **every** shot, repeat the same 3–6
disambiguating attributes for each named subject **verbatim**. Pronouns and "the
same character" do not work. This is the same rule as macro-pickle's consistency
clause and the `character-lock` skill — OpenMontage just makes it per-shot.

```
Aang — bald, blue arrow tattoo on forehead, orange-and-yellow robes — plants his staff.
…
Aang — bald, blue arrow tattoo on forehead, orange-and-yellow robes — turns to camera.
```

Subject transitions: name the cause — "subject revealing / disappearing / switching
by subject movement OR by camera movement" — to unlock reveal-style camerawork.

## Audio (Seedance / VEO 3 / Sora 2 / LTX-2 generate it)

Ambient (wind, crowd murmur) · diegetic (footsteps, glass clink) · voice style
(whisper, gravitas) · music mood. **Put dialogue in quotes:** `says: "Hello world."`
One speaker per clip — multi-person dialogue breaks lip-sync.

## What to avoid → do instead

> **Replace emotional adjectives with the visual CAUSE of the emotion.**
> "inspiring/powerful/moody/epic/cinematic" do not constrain pixels.

| Don't | Do instead |
|---|---|
| "sad character" | "tears on cheek, shoulders slumped, staring at empty chair" |
| "epic" | "low-angle, 24mm wide, sun directly behind subject, lens flare on rim" |
| "cinematic look" | "anamorphic lens, shallow DoF, golden-hour key + crushed shadows" |
| "person moves quickly" | "woman sprints three steps and vaults the railing" |
| readable text / logos | avoid on-screen text (models can't render it; macro-pickle uses negatives + IP-safe `cast` proxies) |
| multiple talkers | one speaker per clip, use reaction shots |
| overloaded prompt | start simple, layer ONE element at a time |

## Iteration loop

1. Start simple — subject + action + setting.
2. Add one element at a time — camera, then lighting, then style.
3. Misfire? Strip back: freeze camera, simplify action, retry.
4. Consistency across clips: repeat the same style/lighting/grade verbatim.
5. Save the seed of a good result for variations.

## How this wires into macro-pickle

- **Brief mapping:** the 5 aspects map onto `VideoBrief`
  (`scene` → Scene+Spatial, `subject` → Subject, `camera` → Camera,
  `beats` → Subject Motion in temporal `0.0-3.0s:` segments, `audio` → Audio,
  `pacing/intent` → Style). Then build with the engine, don't hand-roll strings:
  ```bash
  pnpm prompt --video --brand <brand> --json '<VideoBrief>'
  ```
- **Lint** the storyboard with the MCP `lint_scene` tool (single-beat, fixed-camera,
  stationary-cycle, atmospherics, IP-safety) before generating.
- **Export rule (PROJECT RULE):** when a video prompt is finalized, save it to
  your prompt vault via `--save` / MCP `save:true` (`exportPromptToVault`). Never put
  a copyrighted name in a final prompt — use the brand `cast` proxy.
- Deeper methodology + image-side formula: `content/knowledge/PROMPT-COOKBOOK.md`.
