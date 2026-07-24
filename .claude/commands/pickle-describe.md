---
description: Product OCR + in-use scene recommendation from a photo (Gemini vision; optional PaddleOCR sidecar)
argument-hint: "<image-path> [--title \"name\"] [--brand \"...\"] [--paddle]"
allowed-tools: Bash(pnpm describe*), Bash(pnpm run describe*), Bash(pnpm analyze-video*), Read
---

# /pickle-describe

"Look at" a product photo: OCR foreign text / watermarks to strip, and recommend a faceless
in-use scene — via `pnpm describe` (`describeProduct`, `scripts/lib/vision.ts`). The output
feeds the rest of the pipeline: the recommended scene becomes a brief; the detected text is
what to strip when regenerating owned references. Supabase-free.

## Usage

1. **Describe:**
   `pnpm describe <image> --title "<product>" --brand "<store/style>"` →
   JSON incl. `detected_text` (to strip), `suggested_scene` (a faceless in-use moment), and
   product attributes.
2. **`--paddle`** adds the local PaddleOCR sidecar — high-recall small/CJK text + per-line
   geometry in separate `ocr_*` fields (needs Python + `paddleocr`; non-fatal if absent).
   Note: `ocr_*` fields are **not consumed downstream yet** (the rail is laid for future
   in-place watermark masking) — `--paddle` doesn't change generated output today.
3. **Use the output:**
   - `suggested_scene` → the lifestyle scene for **/pickle-ref** or a UGC brief (**/pickle-ugc**).
   - `detected_text` → the text to **STRIP** when regenerating clean owned refs.

## Notes

- One Gemini vision call per image (paid-eligible) — fine ad-hoc; image quota is separate from
  Veo's. For a reference *clip* use **/pickle-ref**; to mirror a competitor *video* use
  `pnpm analyze-video`.
