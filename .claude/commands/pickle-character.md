---
description: Character / face-locked image generation — drive nano with a character's reference photos + the character-lock skill
argument-hint: "--char <name> \"scene description\" [--model pro] [--save]"
allowed-tools: Bash(pnpm nano*), Bash(pnpm run nano*), Read
---

# /pickle-character

Generate a scene with a **locked human likeness** by feeding real reference photos to nano
(`generateWithRefs`) so the face/identity stays consistent shot to shot. Uses the
**`character-lock`** skill's Visual Anchor workflow (`.claude/skills/character-lock/`).

This is a **generic driver** — point it at any character you have rights to. For recurring
characters, write a dedicated pack script instead so the reference set and physical
description live in one place.

## Usage

1. **Identify the character + its reference photos.** Keep a short "character bible" note
   (physical description, wardrobe, do/don't) next to the photos. Use 2–3 references —
   front-neutral + smile + jaw/profile gives the strongest lock.
2. **Read the `character-lock` skill** for the anchor + redundant-text-anchoring protocol,
   and copy the character's physical description from the bible into the prompt.
3. **Generate:**
   ```bash
   pnpm nano --prompt "<scene> — <character physical description from the bible>" \
     --refs "<photo1>,<photo2>,<photo3>" --model pro --aspect <ratio> --save
   ```
4. **For VIDEO of a real face:** route to **Veo 3.0 (`veo3`)** or **Google Flow** — Veo 3.1
   image-to-video filters face-seeded inputs (see the note in `scripts/lib/veo.ts`).

## House rules

- **Only lock likenesses you have the right to use** — your own, or someone who has given
  explicit consent. Do **NOT** generate real third-party public figures' faces; use a brand
  `cast` proxy description instead (also keeps you clear of IP filters).
- Faceless product/UGC content doesn't need identity lock — that's **/pickle-ugc**.
- On finalize, `--save` exports the prompt to your vault.
- `pnpm nano` (image) is its own quota — generally available even when Veo is rate-limited.
