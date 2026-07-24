/**
 * scripts/ocr.ts  —  `pnpm ocr`
 *
 * Standalone smoke-test / utility for the PaddleOCR sidecar (scripts/lib/paddleocr.ts),
 * independent of Gemini. Prints normalized JSON (texts, scores, polys). Use it to verify
 * the Python bridge works before turning on `pnpm describe --paddle`.
 *
 * Requires a Python with paddleocr installed; point MACRO_PICKLE_PYTHON at it if it's not
 * your default `python`. See scripts/py/requirements.txt. ZERO Supabase.
 *
 *   pnpm ocr --image ./photo.jpg
 *   pnpm ocr --image ./photo.jpg --lang en
 *   pnpm ocr --image ./photo.jpg --version PP-OCRv5
 */
import { config as loadEnv } from "dotenv";
import { runPaddleOcr } from "./lib/paddleocr.js";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(...flags: string[]): string | undefined {
  for (const flag of flags) {
    const i = process.argv.indexOf(flag);
    if (i >= 0) return process.argv[i + 1];
  }
  return undefined;
}

async function main() {
  const imagePath = arg("--image", "-i");
  if (!imagePath) {
    console.error(
      "❌ Usage: pnpm ocr --image <path> [--lang ch|en|japan|...] [--version PP-OCRv5]"
    );
    process.exit(1);
  }

  try {
    const r = await runPaddleOcr({
      imagePath,
      lang: arg("--lang"),
      ocrVersion: arg("--version"),
    });
    console.log(
      JSON.stringify(
        {
          engine: r.engine,
          lang: r.lang,
          ocrVersion: r.ocrVersion,
          count: r.texts.length,
          texts: r.texts,
          scores: r.scores,
          polys: r.polys,
          joinedText: r.joinedText,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
