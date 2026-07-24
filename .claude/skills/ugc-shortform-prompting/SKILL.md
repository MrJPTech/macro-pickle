---
name: ugc-shortform-prompting
description: >-
  Author faceless short-form UGC selling prompts that turn a product photo into
  reference photos and then into platform-ready vertical ad content (TikTok / Reels
  / Shorts) for selling products. Use whenever building a UGC spot, a "finds"/unboxing/
  problem-solution/demo/before-after video, a product reference photo, or a creator-style
  ad in macro-pickle — and whenever deciding the CONTENT FORM (hook, beats, captions, CTA)
  rather than the camera. The selling/content-marketing layer ABOVE openmontage-video-prompting
  (cinematography) and the Prompt Engine (`scripts/lib/prompts/`). Wires `describeProduct`
  (OCR + scene rec) → clean hero → faceless UGC spot. Hands long-form footage to
  opus-clip-automation.
metadata:
  type: creative-prompting
  source: net-new synthesis — 2026 short-form platform rules + creator CTA patterns
  layer: 3
---

# UGC Short-Form Selling Prompts

The **content-marketing / selling** control layer for macro-pickle. It decides the
*content form* — hook, beat structure, captions, CTA, platform fit — that sells a
product in a vertical short. It does **not** re-teach cinematography: camera, motion,
lighting, and identity belong to the `openmontage-video-prompting` skill and to
`buildVideoPrompt`. This layer chooses *what kind of video* and *how it sells*.

> Read this BEFORE building a product/UGC selling prompt. Build with the Prompt Engine
> (`scripts/lib/prompts/ugc.ts` + the `build_ugc_spot` MCP tool) — never
> hand-roll the brief. Methodology: `content/knowledge/PROMPT-COOKBOOK.md` §14.

## The one rule that matters most

**Faceless. Product is the hero. Sell in the first 3 seconds.** Product + hands +
on-screen captions + music/VO, no face in frame. Faceless is the documented house
format *and* it removes identity-lock, face-seed Veo routing, and IP/likeness cost.
Frame it as **organic finds-format seeding**, not a paid interruption ad.

## The selling formats

| Format | Use it for |
|---|---|
| `faceless-finds` (default) | "things you didn't know you needed" reveal — the scroll-stopper |
| `unboxing` | tactile first-touch desire |
| `problem-solution` | show the pain, then the product erasing it |
| `demo` | straight value — how it works in 8s |
| `before-after` | transformation proof (strongest for utility goods) |
| `listicle` | "#1 pick of the season" ranked callout |
| `tutorial` | teach a use-case, sell by demonstrating mastery |

Pick one per spot — it seeds the hook line, the demo beat, the caption cards, and pacing.

## The 8-second beat skeleton

```
0.0-3.0s  HOOK  — the reveal / the pain / the curiosity gap (the 3-second rule)
3.0-6.0s  DEMO  — one clean in-use moment, hands only, the product proving itself
6.0-8.0s  CTA   — final beauty shot + a hand to the link/shop sticker
```

One clip = one beat-set. The posted edit stitches 1–3 clips to the platform sweet spot.

## Hooks & captions

- **3-second hook rule:** ~65% who watch the first 3s watch 10+. Front-load the most
  visual moment. **Never** "Hey guys, welcome to…".
- **Captions are a POST overlay**, burned in by the editor — *not* rendered by the model
  (Veo text garbles; the NEGATIVE keeps in-video text out). They live in `VideoBrief.captions`.
- **CTA / caption bank** (from real "finds" accounts): `things you didn't know you needed 🛒`,
  `link in bio 👇`, `👇 Products Below 👇`, `shop below`, discount-code overlays.

## Platform rules (2026)

| Platform | Ratio | Sweet spot | Watch for |
|---|---|---|---|
| TikTok | 9:16 | 21–34s | on-screen text + audio > hashtags; bottom 20% = UI |
| Instagram Reels | 9:16 | 30–90s | hard 5-hashtag cap (Dec 2025); favors saves + shares |
| YouTube Shorts | 9:16 | 30–60s | hook matters most; swap thumbnail at 24h if weak |

Safe zone = **60% centered box** (20% top/bottom, 10% sides). Export **1080p**.
**3–5 hashtags max.** Stagger the same clip 2–4h across platforms.

## The product → UGC pipeline

1. **`describeProduct`** (`pnpm describe` / MCP `describe_product`) — Gemini vision on the
   raw supplier photo: OCRs the text/watermark to STRIP, reads materials, recommends an
   in-use scene. The OCR / content-parsing rail.
2. **Clean hero still** — brand-neutral studio reference (OCR'd text → negative). Clean first.
3. **Faceless lifestyle still** — product-in-use, hands only, on-brand.
4. **9:16 UGC spot** — the selling brief above.

## What to avoid → do instead

| Don't | Do |
|---|---|
| Show a face / hire a creator | Hands + product only (faceless) |
| Put the CTA text "in" the Veo prompt | Generate clean footage; burn captions in post |
| Open with a slow intro | Hook the product/payoff in frame 1 |
| Keep the supplier's foreign text/watermark | `describeProduct` → strip it in the hero negative |
| Cram 20 hashtags | 3–5; lean on on-screen text + audio |
| Rebuild a video clipper for long footage | Hand off to `opus-clip-automation` |

## How this wires into macro-pickle

- **Code:** `scripts/lib/prompts/ugc.ts` — `UGC_FORMATS`, `ugcSpotBrief`, `cleanHeroBrief`,
  `ugcStillBrief`, `ugcBriefSet`. New `VideoBrief` fields `format` + `captions` render the
  FORMAT line and the ON-SCREEN CAPTIONS post-overlay block in `buildVideoPrompt`.
- **CLI:** `pnpm describe …` (vision); build spots via the `build_ugc_spot` MCP tool or `buildUgcSpot` in a pack script.
- **MCP (`macro-pickle-images`):** `describe_product`, `build_ugc_spot`.
- **Brand:** drop `content/brands/<store>.json` (faceless: `aspect: "9:16"`, no `cast`).
  Example: `quiet-desk.json`.
- Finalized prompts export to your prompt vault via `exportPromptToVault`
  (`--save` / `save: true`).
- **Cinematography:** defer camera/motion/identity to `openmontage-video-prompting`.
- **Long-form → clips:** hand off to `opus-clip-automation` (Opus/Vizard → social-slash).
