/**
 * scripts/generate-nano.ts  —  `pnpm nano`
 *
 * Reference-driven image generation via Nano Banana 2 / Pro. Builds the prompt
 * with the Prompt Engine (brand-aware) or takes a raw --prompt, feeds REAL
 * reference photos to lock identity, writes PNGs, and (optionally) saves the
 * prompt to your vault. No database.
 *
 *   pnpm nano --prompt "studio portrait" --refs a.jpg,b.jpg --model pro
 *   pnpm nano --file brief.json --brand nbh --refs classics/DSC01168.jpg --model 2 --save
 *
 * Flags:
 *   --file <path>     ImageBrief JSON (built via buildImagePrompt)
 *   --prompt <text>   Raw prompt (skips the engine)
 *   --brand <name>    Apply a brand profile (with --file)
 *   --refs <paths>    Comma-separated reference image paths (identity lock)
 *   --model 2|pro|1   Nano Banana model (default 2)
 *   --aspect <ratio>  e.g. 16:9, 2:3, 9:16
 *   --size 1K|2K|4K   Output resolution (Pro supports up to 4K)
 *   --count <n>       Variations (default 1)
 *   --name <slug>     Filename base
 *   --out <dir>       Output dir (default $MACRO_PICKLE_EXPORT_DIR)
 *   --save            Export the prompt to the vault
 *   --title <name>    Note title for --save
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { buildImagePrompt } from "./lib/prompts/image.js";
import { exportPromptToVault } from "./lib/prompts/export.js";
import { generateWithRefs, NANO_LABEL, type NanoModelKey } from "./lib/nano-banana.js";
import type { ImageBrief } from "./lib/prompts/types.js";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (flag: string) => process.argv.includes(flag);

async function main() {
  const file = arg("--file");
  const rawPrompt = arg("--prompt");
  const brand = arg("--brand");
  const model = (arg("--model") ?? "2") as NanoModelKey;
  const aspect = arg("--aspect");
  const size = arg("--size") as "1K" | "2K" | "4K" | undefined;
  const count = arg("--count") ? Number(arg("--count")) : 1;
  const name = arg("--name");
  const out = arg("--out") || process.env.MACRO_PICKLE_EXPORT_DIR || "generated-images";
  const refs = (arg("--refs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let prompt: string;
  let aspectOut = aspect ?? "16:9";
  let briefObj: Record<string, unknown> | undefined;

  if (file) {
    briefObj = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (brand) briefObj!.brand = brand;
    if (aspect) briefObj!.aspect = aspect;
    const built = buildImagePrompt(briefObj as unknown as ImageBrief);
    prompt = built.prompt;
    aspectOut = aspect ?? built.aspect;
  } else if (rawPrompt) {
    prompt = rawPrompt;
  } else {
    console.error("❌ Pass --file <brief.json> or --prompt <text>.");
    process.exit(1);
  }

  console.log(`\n🍌 ${NANO_LABEL[model]}  |  aspect ${aspectOut}  |  refs: ${refs.length}`);
  console.log(`\n${prompt}\n`);

  if (has("--save")) {
    const f = exportPromptToVault({
      kind: "image",
      title: arg("--title") || name || String(briefObj?.subject ?? "nano prompt"),
      prompt,
      brand,
      aspect: aspectOut,
      tool: NANO_LABEL[model],
      brief: briefObj ?? { prompt, refs },
    });
    console.log(`📓 Saved to vault: ${f}`);
  }

  console.log(`🎨 Generating → ${out}`);
  try {
    const files = await generateWithRefs({
      prompt,
      refs,
      outDir: out,
      name: name ?? String(briefObj?.subject ?? "nano"),
      model,
      aspect: aspectOut,
      imageSize: size,
      count,
    });
    for (const f of files) console.log(`   ✅ ${f.filename}  (${Math.round(f.bytes / 1024)} KB)`);
  } catch (err) {
    console.error(`   ❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
