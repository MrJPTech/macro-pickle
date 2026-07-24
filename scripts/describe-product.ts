/**
 * scripts/describe-product.ts  —  `pnpm describe`
 *
 * Front door of the product -> reference-photo -> UGC pipeline. Point Gemini vision
 * (scripts/lib/vision.ts) at a raw supplier product photo (usually carrying foreign
 * text / watermarks / stickers) and get structured JSON back:
 *   - detected_text   : the OCR'd text/branding to STRIP for a clean recreation
 *   - product_type    : what it plainly is
 *   - materials       : finish / colors
 *   - suggested_scene : one real-world IN-USE scene to stage it in
 *   - usage_context   : who uses it and how
 *
 * Feed suggested_scene into a UGC brief (ugc.ts), and detected_text into the clean
 * hero's negative. ZERO Supabase. Requires GOOGLE_API_KEY in .env.local.
 *
 *   pnpm describe --image ./photo.jpg
 *   pnpm describe --image ./photo.jpg --title "Folding Camp Stool" --brand "Quiet Desk Co. (premium desk objects)"
 *   pnpm describe --image ./photo.jpg --paddle      # also run the local PaddleOCR sidecar
 *   pnpm describe --image ./photo.jpg --save        # also write a vault note
 */

import { config as loadEnv } from "dotenv";
import { describeProduct } from "./lib/vision.js";
import { exportPromptToVault } from "./lib/prompts/export.js";

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
      "❌ Usage: pnpm describe --image <path> [--title <t>] [--description <d>] [--brand <framing>] [--paddle] [--paddle-lang <ch|en|...>] [--save]"
    );
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ describeProduct requires GOOGLE_API_KEY in .env.local");
    process.exit(1);
  }

  try {
    const desc = await describeProduct({
      imagePath,
      title: arg("--title"),
      description: arg("--description"),
      brand: arg("--brand"),
      paddleOcr: process.argv.includes("--paddle"),
      paddleLang: arg("--paddle-lang"),
    });
    console.log(JSON.stringify(desc, null, 2));

    if (process.argv.includes("--save")) {
      const body = [
        `**Product type:** ${desc.product_type}`,
        `**Materials:** ${desc.materials}`,
        `**Usage:** ${desc.usage_context}`,
        `**Detected text to strip:** ${desc.detected_text || "(none)"}`,
        desc.ocr_texts?.length
          ? `**PaddleOCR (${desc.ocr_engine}) read:** ${desc.ocr_texts.join(" · ")}`
          : "",
        ``,
        `**Suggested in-use scene:**`,
        desc.suggested_scene,
      ]
        .filter(Boolean)
        .join("\n");
      const file = exportPromptToVault({
        kind: "image",
        title: `${arg("--title") || "product"} — vision describe`,
        prompt: body,
        tool: "Gemini vision (describeProduct)",
        brief: desc,
      });
      console.log(`\n📓 Saved to vault: ${file}`);
    }
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
