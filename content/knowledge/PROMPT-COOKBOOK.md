---
title: macro-pickle Prompt Cookbook
type: prompting-knowledge
created: 2026-06-13
sources:
  - LOGIC/repositories/youtube-shorts-pipeline
  - LOGIC/repositories/BigBanana-AI-Director
  - LOGIC/repositories/narrator-ai-cli-skill
  - LOGIC/repositories/Generative-Media-Skills
  - LOGIC/repositories/awesome-seedance-2-prompts
  - LOGIC/repositories/awesome-nano-banana-pro-prompts
  - LOGIC/repositories/multica
  - LOGIC/repositories/oh-my-claudecode
tags: [prompting, scene, veo, imagen, nano-banana, seedance, director]
---

# macro-pickle Prompt Cookbook

The synthesized prompting methodology for macro-pickle scene/image/video work.
Distilled from eight reference repos and wired into an **executable Prompt Engine**
at `scripts/lib/prompts/`. This doc is the *why*; the code is the *how*.

> **Golden rule (from every repo):** write **full descriptive sentences**, not
> keyword soup ("8k, masterpiece, trending" is noise). Phrase negatives as things
> to *avoid*. Render exact on-image text in **double quotes**. Lock identity by
> **repeating the character descriptor verbatim** in every shot.

---

## 1. The two master formulas

### IMAGE — Nano Banana "Perfect Prompt" formula
> `Subject + Action + Context + Composition + Lighting + Style`

| Component | Example |
|-----------|---------|
| Subject | "A stoic robot barista with exposed copper wiring" |
| Action | "Pouring a latte-art leaf with mechanical precision" |
| Context | "Inside a neon-lit cyberpunk cafe at midnight" |
| Composition | "Close-up, 85mm lens, f/1.8" |
| Lighting | "Volumetric blue rim light, warm cafe glow" |
| Style | "Cinematic, photorealistic, 4K" |

Code: `buildImagePrompt(brief: ImageBrief)` → `scripts/lib/prompts/image.ts`.

### VIDEO — Seedance/Veo "Director Brief" (six-component hierarchy)
> `Scene · Subject · Camera · Action · Audio · Pacing/Style`

| Component | Holds |
|-----------|-------|
| Scene | environment + lighting |
| Subject | identity + detail (repeated verbatim) |
| Camera | movement + lens + shot size + speed |
| Action | **time-segmented** beats (`0.0-3.0s: …`) |
| Audio | music + SFX + ambience (Veo/Seedance generate audio natively) |
| Pacing/Style | timing + mood + color grade |

Code: `buildVideoPrompt(brief: VideoBrief)` → `scripts/lib/prompts/video.ts`.

---

## 2. Time-segmented prompting + the single-beat rule

Split action into chronological windows so the model paces the clip:

```
0.0-3.0s: [opening beat — establishing action, fixed camera]
3.0-6.0s: [development beat]
6.0-8.0s: [climax / key action]
```

**Single-beat rule (load-bearing):** an 8s clip holds ~1-2 beats; 10-15s holds 3-4
max. Overloading a segment degrades output. `lintScene` warns above 4 beats.

This mirrors macro-pickle's existing `content/gemini-gem-guide.md` sub-timestamp
directive — now enforced in code.

---

## 3. Keyframe-driven video (the BigBanana pattern)

Text-to-video is weak at precise motion. Instead: **Draw first, move later.**
1. Generate a **Start frame** and an **End frame** with Nano Banana Pro / Imagen.
2. Let Veo 3.1 **interpolate** the motion between them.
3. Constrain both frames with the same character/scene **asset references**.

Use this for any shot needing an exact start/end state (a box tumbling on a locked
axis, a coin completing one orbit). Pick a route per shot: `image-to-video` (one frame),
`keyframe` (start+end), or `storyboard` (9-grid → pick one → promote to start).

---

## 4. The @-reference system (multi-asset binding)

When feeding multiple reference images/clips, assign each a role instead of hoping
the model guesses:

```
@Image1 as the character, @Image2 as the scene, reference @Video1 camera movement,
BGM references @Audio1
```

Roles: first/last frame · character appearance · scene/background · camera move ·
action choreography · outfit · product appearance · BGM · SFX. Multi-image as
**time-ordered keyframes**: *"use the N reference images as time-ordered keyframes,
not as a storyboard sheet."* Pass these via `brief.refs` in either builder.

---

## 5. Character & continuity lock

- **Establish once, reference for all.** Generate a canonical character sheet,
  then feed it as a constraint into every subsequent shot (BigBanana Consistency
  Sheet + wardrobe system).
- **Repeat the descriptor verbatim** every prompt — never rely on model memory.
- Append the **consistency clause** (`CONSISTENCY_CLAUSE` in `presets.ts`) on
  multi-shot / recurring-character work: *"identical face, hairstyle, skin tone,
  outfit… no facial drift, no morphing."* Toggle with `brief.consistency: true`.

Pairs with the `character-lock` skill and your own character profiles.

---

## 6. Brand/style profiles (the niche-profile pattern)

One JSON file per brand at `content/brands/<name>.json` (DB-free). Each profile
carries `style`, `palette`, `prefer`, `avoid`, `promptSuffix`, `aspect`, `cast`.
Both builders auto-apply it via `brief.brand`:
- `style` + `palette` are appended to the prompt body
- `promptSuffix` is appended last (overrides the quality preset)
- `avoid` is folded into the negative `Avoid:` list
- `aspect` becomes the default ratio

Worked example: **quiet-desk**. List installed profiles with `pnpm prompt --brands`.
Add a brand = drop a new JSON file; no code change.

---

## 7. Negative prompts + the prefer/avoid split

Negatives are proven load-bearing across both corpora. Presets in `presets.ts`:
- `image` — blurry, deformed hands, extra fingers, watermark, readable UI text, …
- `video` — no distortion/stretching/jump-cuts/flicker/shake/morphing faces, …
- `product` — wrong logo, misspelled brand text, color shift on product, harsh
  colored light cast on the product, …

A brand's `avoid` list extends the negative automatically — e.g. a product-lighting
rule like "colored backdrop good, colored light cast on the product bad" belongs
in `avoid`.

---

## 8. Camera grammar (controlled vocabulary)

Use the fixed vocabulary in `camera.ts` instead of free text to reduce drift:
- **Shot sizes:** ECU → close-up → medium → wide → establishing
- **Moves:** static · push-in · pull-out · pan · tilt · tracking · 360° orbit ·
  crane · whip pan · dolly zoom · FPV drone dive · speed ramp
- **Lenses:** 14/24/35/50mm · 85mm portrait · 100mm macro · anamorphic

**Intent presets** (`INTENT_PRESETS`) expand a vibe into camera+lighting+grade:
`epic · intimate · product · energetic · noir`. Pass `brief.intent: "product"`.

For images, you can also steer realism with literal photo params in the
`composition`/`lighting` fields: focal length (mm), aperture (f), ISO, EV,
white-balance (K), aspect ratio.

---

## 9. The macro-pickle scene schema (storyboard)

The canonical storyboard block (already used in `content/*-prompts.md`) is now a
typed `Scene` (`types.ts`) with a serializer + linter:

```
## PROMPT N: "Title"
**Scene**: one-sentence context.

​```
SCENE: EXT/INT. LOCATION - TIME.
SUBJECT: trademark-safe descriptors, repeated in full.
ACTION:
- 0.0-3.0s: beat A (fixed camera).
- 3.0-8.0s: beat B (stationary cycle + background slide if moving).
- ATMOSPHERIC DETAILS: looping motion (haze, particles, birds).
STYLE: art style, palette, lighting.
​```
```

`sceneToMarkdown(scene)` writes it; `lintScene(scene)` audits it.

---

## 10. The linter (Continuity & IP-Safety check)

`lintScene` turns the gem-guide "Command 5" prose into real checks:
- **ip-safety (error):** copyrighted names (Richie Rich, Mr. Monopoly, …) → must
  become descriptive proxies. Use the brand `cast` map for ready-made proxies.
- **single-beat (warn):** > 4 beats per clip.
- **atmospherics (warn):** no looping background motion.
- **stationary-cycle (warn):** movement words without "in place / background
  slides" — risks warping.
- **fixed-camera (warn):** dynamic camera words without a fixed/locked callout.

---

## 11. IP-safe proxy substitution

Never put a copyrighted name in the final prompt. Translate to a descriptive
profile (clothing, features, body) to pass safety filters. The brand `cast` map
holds the proxies, e.g. `"tycoon-kid"` → *"wealthy blonde cartoon boy in a blue suit
with a red bowtie."* Companion: the `character-lock` skill.

---

## 12. Stationary-cycle mechanics (warp-free motion)

To keep faces/outfits stable during walk/run/drive: the subject moves **in place**
while the **environment slides** behind them (floors down, buildings back). Always
pair a movement verb with a stationary + background-slide callout. Keep the camera
**fixed** unless a move is explicitly wanted.

---

## 13. Convention — exported prompts are saved to your vault

When a prompt is **finalized/exported** for use, write it into your notes vault as
Obsidian-flavored markdown, laid out for
copy-paste (prompt body in a fenced ```text``` block, source brief in a collapsed
callout). Implemented by `exportPromptToVault` (`scripts/lib/prompts/export.ts`):
- CLI: `pnpm prompt … --save [--title "…"]`
- MCP: `save: true` on `build_image_prompt` / `build_video_prompt`
- Destination: `./exported-prompts/<brand>/` (point `MACRO_PICKLE_PROMPT_VAULT` at
  your vault to collect them there instead).

Do not invent a different export format. A dry build (no `--save`) is fine for
iterating; the moment it's a keeper, save it.

---

## 14. UGC & short-form vertical content (selling products)

The selling layer that turns a **product photo → reference photos → short-form UGC
ad** for organic finds-format seeding. Code: `scripts/lib/prompts/ugc.ts`. This sits
*above* the cinematography layer (`openmontage-video-prompting` skill / `buildVideoPrompt`)
and decides the **content form**, not the camera. Skill: `ugc-shortform-prompting`.

> **Faceless by default.** Product + hands + on-screen captions + music/VO — no face
> in frame. That's the documented house format AND it sidesteps identity-lock, the
> face-seed Veo routing, and IP/likeness cost. (On-camera variants need a brand `cast`
> entry + real refs; see §5.)

### The product → UGC pipeline
1. **Parse the source photo** — `describeProduct` (`scripts/lib/vision.ts`, `pnpm describe`)
   runs Gemini vision: OCRs the **text/watermark/sticker to STRIP**, reads materials, and
   recommends a real-world **in-use scene**. The OCR rail.
2. **Clean hero still** — `cleanHeroBrief` → a BRAND-NEUTRAL studio e-commerce reference
   (the OCR'd text goes into the negative so foreign branding is removed). *Clean before
   you stylize*.
3. **Faceless lifestyle still** — `ugcStillBrief` → product-in-use, hands only, on-brand.
4. **9:16 UGC spot** — `ugcSpotBrief(product, format, brand)` → a Director Brief with the
   3-beat selling skeleton + a caption track.

### The selling formats (`UGC_FORMATS`)
`faceless-finds` (default — "things you didn't know you needed" reveal) · `unboxing` ·
`problem-solution` · `demo` · `before-after` · `listicle` · `tutorial`. Each seeds the
hook line, the demo beat, the caption cards, and pacing — pick one per spot like an
`intent` preset.

### Editing grammar (encoded, not hand-waved)
- **3-beat structure:** `0.0-3.0s` HOOK → `3.0-6.0s` DEMO → `6.0-8.0s` CTA. One clip; the
  posted edit stitches 1–3 clips to the platform sweet spot below.
- **3-second hook rule:** ~65% who watch the first 3s watch 10+. Front-load the most
  visual moment / the product reveal. **Never** open with "Hey guys, welcome to…".
- **Captions are a POST overlay** (`VideoBrief.captions` → the `ON-SCREEN CAPTIONS` block).
  The model generates clean footage and the editor burns in kinetic captions — Veo text
  garbles, so the NEGATIVE keeps in-video text out. Same discipline as `LYRIC SYNC` (§ video).
- **CTA / caption patterns**: down-arrow "shop below"
  (`link in bio 👇`, `👇 Products Below 👇`), the "things you didn't know you needed 🛒"
  opener, discount-code overlays.

### Platform rules (2026 — mined from the `opus-clip-automation` skill)
| Platform | Ratio | Length sweet spot | Notes |
|---|---|---|---|
| TikTok | 9:16 | **21–34s** | on-screen text + audio matter more than hashtags; bottom 20% = UI |
| Instagram Reels | 9:16 | 30–90s | **hard 5-hashtag cap** since Dec 2025; favors saves + shares |
| YouTube Shorts | 9:16 | 30–60s | hook matters most; swap thumbnail at 24h if retention is weak |

- **Safe zone:** keep product + captions inside a **60% centered box** (20% top, 20%
  bottom, 10% each side). Export **1080p** (4K is wasted on shorts).
- **Hashtags: 3–5 max** — categorization, not reach. **Stagger** the same clip 2–4h
  across platforms; never simultaneous.

### Long-form → clips handoff
This engine generates *born-short* UGC. To turn existing **long-form footage** into
shorts, hand off to the `opus-clip-automation` skill (Opus/Vizard → `social-slash`
cross-platform post). Reference-video *understanding* (mirror a competitor's hook/format)
is `describeReferenceVideo` / `pnpm analyze-video`.

### Build it
```bash
pnpm describe --image ./supplier-photo.jpg --brand "Quiet Desk Co. (premium desk objects)"
# Build spots via the `build_ugc_spot` MCP tool, or loop `buildUgcSpot`
# (scripts/lib/prompts/ugc.ts) over a PRODUCTS array in your own pack script.
```
MCP (`macro-pickle-images`): `describe_product`, `build_ugc_spot`. Brand:
`content/brands/quiet-desk.json`.

---

## 15. AI-Influencer UGC — Director's Framework (the @lilypadtts model)

The director-level system for **AI virtual-influencer product commercials** — a
proven TikTok Shop model studied from @lilypadtts (18.3K followers, 1.7M likes,
2.9M–5.1M-play hits). This section translates her mechanics into Director Brief
vocabulary and macro-pickle pipeline decisions.

> **Two archetypes.** Worn products (dresses, fashion) → lock an **AI model +
> mirror-selfie set** and swap only the garment. Non-worn products (gear,
> QuietDesk) → lock an **AI scene + hands** (campsite, desk) and swap only the
> product. Same consistency discipline, different substrate.

### The five locked mechanics (from the teardown)

| Lock | What it means | Director Brief field |
|---|---|---|
| **Character-lock** | Same face/body every post = instant brand recognition with zero production cost | `subject` repeated verbatim; use `cast` + `@refs` for model bible |
| **Set-lock** | Identical bedroom/mirror/lamp per post; only the outfit/product changes | `scene` stays constant across all posts in a batch |
| **Audio surfing** | Ride trending *commercial-safe* sounds — never create original audio | Pick from the platform's commercial-use library; match BPM×energy to store voice |
| **Save-optimization** | Metric is **SAVES**, not comments. Save ratio ≈ 275:1 over comments on 5.1M-play video | Bake "save this for your next [use-case]" soft CTA into `VideoBrief.captions` beat 3 |
| **Shop anchor** | TikTok Shop product tag on every post (one-tap buy in-app) — no link-in-bio | Attach at publish (social-slash / Late SDK); every caption ends with shop trigger |

**Signal facts (from live teardown):**
- Likes ≫ followers (93:1) → **algorithm-driven, content-first** — follower count is
  irrelevant. A new account can hit 3M plays before it has 1K followers.
- 287 posts. A few 1M+ bangers carry the account on a power-law. **Volume is the play.**
- Batch posting confirmed: 3 videos uploaded within 5 minutes (video IDs decoded).
  Generate in batches, post in batches, **pin winners** for months.

### Director Brief rules (worn-product / fashion)

```
Scene:    Warm cozy bedroom, phone-in-hand mirror selfie, single warm lamp,
          soft natural morning light. Locked set — identical every post.
Subject:  [Lila — the locked AI house model]: mid-20s, [consistent description
          verbatim]. Wearing [exact garment: color / cut / material].
Camera:   Static or very slow pan. Full-body so the entire garment reads.
          9:16, vertical, shot as authentic phone UGC — not a studio shoot.
Action:   0.0-3.0s: HOOK — model looks into camera, bait line on-screen.
          3.0-6.0s: DEMO — slow rotate / pose showing garment detail / movement.
          6.0-8.0s: CTA — model smiles; caption: "save for your next [occasion] 🛒".
Audio:    Trending commercial-safe sound matched to niche BPM (see table below).
Style:    Authentic warm UGC aesthetic. NO studio backdrop. NOT fashion-editorial.
Negative: two models in frame, text leak from source garment, watermarks,
          studio lighting, white seamless backdrop, posing stiffness.
```

### Niche-specific director hooks (proven format per hashtag cluster)

| Niche | Hook (on-screen line 1) | Demo payoff | BPM range |
|---|---|---|---|
| `#tennisdress #activedress` | "a tennis dress that actually **hides everything** when you bend" | bend / serve test → built-in shorts revealed | 110–150 upbeat |
| `#casualdress #ootd` | "the everyday dress I reach for" | mirror GRWM, soft warm light, lowercase 1-line hook | 85–110 relaxed |
| `#summeroutfit #vacationdress` | "save this for your next trip ✈️" | window twirl, flowy maxi, aspirational | 90–115 breezy |
| `#elegantdress #slimfit` | "French-girl elegant on a $29 budget" | slow-pan silhouette reveal, clean-girl aesthetic | 80–105 calm |
| `#cutedress #coquette` | "the cutest $24 dress 🎀" | A-line twirl, bow / ribbon detail, affordability front | 95–120 sweet |

**Caption / SEO pattern** (ported directly from @lilypadtts):
- Title: `[Garment type] [Material/Detail] [Occasion] | OOTD` (TikTok search)
- Caption: `#outfit-type #occasion #brandname #ootd #under30 💗` (no prose)
- Playlists: "Under $30 Dresses", "Tennis Dress Edit", "Vacation Maxis"

### Two-tier production pipeline (cost discipline)

```
Step 1 — CHEAP STILLS (NB2, ~$0.04/frame)
  generateWithRefs({ refs: [modelBibleFrame, garmentPhoto], prompt })
  → "this exact model wearing this exact garment, mirror-selfie, full-body, locked set"
  → Batch N garments in one run.

Step 2 — GARMENT FIDELITY QA (free)
  Vision-check: does the AI wear the EXACT sourced garment (color/cut/print)?
  No two-model blending? No text leak from source watermarks?
  → PASS: promote to animation. FAIL: regen or adjust garment ref.

Step 3 — ANIMATE WINNERS ONLY (Veo 3.0, billed)
  generateVideo({ imagePath: dressedStill, model: "veo3", aspect: "9:16" })
  ⚠️ ROUTE TO veo3 — Veo 3.1 preview filters face-seeded image-to-video.
  → 5–8s mirror-selfie clip. Enforce duration=5 to control spend.

Step 4 — SCORE + PUBLISH
  Attach commercial-safe trending audio.
  Burn caption cards in editor (never render text in-model).
  Post via social-slash / Late SDK with TikTok Shop product anchor.
  Pin winners for months.
```

**Pilot proof (2026-06-28):** 1 model bible + 3 garments → 3 dressed stills.
Cost: $0.24. Garment fidelity passed on all 3 including one with heavy OOTD/price
overlay on the source — the "remove all text" negative held, overlay did NOT bleed.

### Garment sourcing → prompt prep

Most listing images are **on-model lifestyle shots** (with OOTD price overlays), NOT
flat-lays. Feeding a lifestyle shot into `generateWithRefs` risks two-model blending.
**Garment isolation protocol:**
1. Prefer the listing's flat-lay image when available.
2. If only on-model: generate isolation first — `"the [exact garment] alone on white,
   no model, no text, no background, ghost-mannequin"` — then use the isolated still
   as the garment ref.
3. For simple single-color pieces the isolation is a nice-to-have (the pilot proved
   on-model sources can work). For patterned / layered / structured pieces: mandatory.

### Non-worn product variant (gear, desk objects)

Replace character-lock + set-lock with **scene-lock**:

```
Scene:    [Locked consistent set: e.g. "a sun-dappled forest campsite with a green
          tent at dawn, same every post"]. Product in-use.
Subject:  HANDS ONLY — no face. Product prominently featured.
Camera:   Close-up on product interaction, then pull to lifestyle reveal.
Action:   0.0-3.0s: product reveal / "things you didn't know you needed" discovery.
          3.0-6.0s: demo — show the function / benefit in use.
          6.0-8.0s: "save this for your next [camping trip / WFH setup] 🛒"
```

This is the §14 faceless pipeline. The @lilypadtts mechanics (audio surfing, save
optimization, shop anchor, batch cadence, pin winners) apply identically — only
the visual substrate changes from a character to a scene.

### AI disclosure (non-negotiable)
TikTok AIGC label on every post. Keep the model clearly synthetic — removes
talent-likeness, IP risk, and real-influencer rate. The @lilypadtts model proves
disclosure doesn't hurt reach (5.1M plays, no verification badge).

### Source references
- `2026-06-28-lilypadtts-ai-ugc-teardown.md` — live teardown (all stats above)
- `2026-06-28-ai-influencer-fashion-pipeline-spec.md` — build spec
- `2026-06-28-fashion-pilot-results-and-dev-log.md` — pilot proof + findings
- `2026-06-28-dress-ugc-content-playbook.md` — per-niche format rules

---

## CLI quick reference

```bash
pnpm prompt --brands                         # list brand profiles
pnpm prompt --image --json '{"subject":"…"}' # build an image prompt
pnpm prompt --image --brand quiet-desk --json '{"subject":"…"}' --gen   # build + generate
pnpm prompt --image --brand quiet-desk --json '{"subject":"…"}' --save  # build + save to vault
pnpm prompt --video --brand quiet-desk --json '{"scene":"…","subject":"…","intent":"product"}' --save
pnpm describe --image ./photo.jpg --brand "Quiet Desk Co."   # OCR + scene rec
```

MCP (Claude Desktop, `macro-pickle-images`): `build_image_prompt`,
`build_video_prompt`, `describe_product`, `build_ugc_spot`, `lint_scene`,
`generate_image` (the build tools take `save: true`).

Slash commands: `/pickle-prompt`, `/pickle-ugc`.
