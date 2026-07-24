/**
 * scripts/generate-kling.ts  —  `pnpm kling`
 *
 * Render clips via Kling (fal.ai). Mirrors generate-veo.ts conventions: reads a
 * Director Brief JSON or a raw --prompt, seeds with an optional --image, and runs
 * across one or more model keys.
 *
 *   pnpm kling --file content/briefs/<brief>.json --brand quiet-desk \
 *              --image ".../ref-seed.jpg" --models i2v-pro --duration 10
 *
 *   pnpm kling --prompt "Product shot, collapsible bucket..." --models t2v-master
 *
 * Flags:
 *   --file <brief.json>            Director Brief to render (builds prompt via Prompt Engine)
 *   --prompt <text>                Raw prompt override
 *   --brand <name>                 Brand profile to apply when using --file
 *   --image <path>                 Seed image (triggers i2v; aspect inferred from image)
 *   --end-image <path>             Last-frame lock (i2v only)
 *   --models <csv>                 i2v-pro | t2v-master | i2v-4k  (default: i2v-pro if --image else t2v-master)
 *   --duration 5|10                Clip length in seconds (default 5)
 *   --aspect 16:9|9:16|1:1         t2v only (default 16:9)
 *   --name <slug>                  Output filename slug
 *   --out <dir>                    Output directory (default: MACRO_PICKLE_EXPORT_DIR/kling-clips or ./kling-clips)
 *   --no-audio                     Disable Kling native audio generation
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { buildVideoPrompt } from "./lib/prompts/video.js";
import { generateKlingVideo, KLING_LABEL, KLING_MODELS, type KlingKey } from "./lib/kling.js";
import type { VideoBrief } from "./lib/prompts/types.js";

loadEnv({ path: ".env.local" });
loadEnv();

const arg = (f: string) => {
  const i = process.argv.indexOf(f);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (f: string) => process.argv.includes(f);

async function main() {
  const file = arg("--file");
  const rawPrompt = arg("--prompt");
  const brand = arg("--brand");
  const image = arg("--image");
  const endImage = arg("--end-image");
  const duration = (arg("--duration") ?? "5") as "5" | "10";
  const aspect = (arg("--aspect") ?? "16:9") as "16:9" | "9:16" | "1:1";
  const name = arg("--name");
  const noAudio = hasFlag("--no-audio");
  const out =
    arg("--out") ??
    (process.env.MACRO_PICKLE_EXPORT_DIR
      ? `${process.env.MACRO_PICKLE_EXPORT_DIR}/kling-clips`
      : "kling-clips");

  const defaultModel: KlingKey = image ? "i2v-pro" : "t2v-master";
  const models = (arg("--models") ?? defaultModel)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as KlingKey[];

  let prompt: string;
  let nm = name ?? "clip";

  if (file) {
    const brief = JSON.parse(fs.readFileSync(file, "utf-8")) as VideoBrief;
    if (brand) brief.brand = brand;
    prompt = buildVideoPrompt(brief);
    nm = name ?? file.split(/[\\/]/).pop()!.replace(/\.json$/, "");
  } else if (rawPrompt) {
    prompt = rawPrompt;
  } else {
    console.error("❌ Pass --file <brief.json> or --prompt <text>.");
    process.exit(1);
    return;
  }

  const unknowns = models.filter((m) => !KLING_MODELS[m]);
  if (unknowns.length) {
    console.error(`❌ Unknown model(s): ${unknowns.join(", ")}. Valid: ${Object.keys(KLING_MODELS).join(", ")}`);
    process.exit(1);
  }

  console.log(
    `\n🎬 ${nm}  |  mode: ${image ? "image-to-video" : "text-to-video"}  |  duration: ${duration}s  |  models: ${models.join(", ")}\n`
  );

  const results: { model: KlingKey; file?: string; sec?: number; mb?: number; err?: string }[] = [];

  for (const m of models) {
    process.stdout.write(`• ${KLING_LABEL[m]} … rendering`);
    try {
      const r = await generateKlingVideo({
        prompt,
        imagePath: image,
        endImagePath: endImage,
        duration,
        aspect,
        generateAudio: !noAudio,
        outDir: out,
        name: nm,
        model: m,
        onTick: () => process.stdout.write("."),
      });
      const mb = Math.round((r.bytes / 1024 / 1024) * 10) / 10;
      const sec = Math.round(r.seconds);
      console.log(` ✅ ${r.file.split(/[\\/]/).pop()}  (${mb} MB, ${sec}s)`);
      results.push({ model: m, file: r.file, sec: r.seconds, mb: r.bytes / 1024 / 1024 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ❌ ${msg}`);
      results.push({ model: m, err: msg });
    }
  }

  console.log("\n— Summary —");
  for (const r of results) {
    if (r.file) {
      const mb = Math.round((r.mb ?? 0) * 10) / 10;
      const sec = Math.round(r.sec ?? 0);
      console.log(`  ${KLING_LABEL[r.model]}: ${r.file.split(/[\\/]/).pop()} (${mb}MB, ${sec}s)`);
    } else {
      console.log(`  ${KLING_LABEL[r.model]}: FAILED — ${r.err}`);
    }
  }
}

main();
