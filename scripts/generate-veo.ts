/**
 * scripts/generate-veo.ts  —  `pnpm veo`
 *
 * Render 8s clips with Veo (text-to-video or image-to-video). Builds the prompt
 * from a video Director Brief via the Prompt Engine (or --prompt), seeds with an
 * optional image, and renders across one or more model tiers for comparison.
 *
 *   pnpm veo --file content/briefs/<brief>.json --brand quiet-desk \
 *            --image ".../seed.png" --models quality,fast,lite,veo3
 *   pnpm veo --prompt "..." --models fast --out clips
 *
 * Flags: --file <brief.json> | --prompt <text> | --brand <name> | --image <seed.png>
 *        --models <csv quality,fast,lite,veo3,veo3-fast,veo2> (default fast)
 *        --aspect 16:9 | --resolution 720p|1080p | --name <slug> | --out <dir>
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { buildVideoPrompt } from "./lib/prompts/video.js";
import { generateVideo, VEO_LABEL, VEO_MODELS, type VeoKey } from "./lib/veo.js";
import type { VideoBrief } from "./lib/prompts/types.js";

loadEnv({ path: ".env.local" });
loadEnv();

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const file = arg("--file");
  const rawPrompt = arg("--prompt");
  const brand = arg("--brand");
  const image = arg("--image");
  const refPaths = (arg("--refs") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const aspect = arg("--aspect") || "16:9";
  const resolution = arg("--resolution");
  const name = arg("--name");
  const out = arg("--out") || (process.env.MACRO_PICKLE_EXPORT_DIR ? `${process.env.MACRO_PICKLE_EXPORT_DIR}/clips` : "clips");
  const models = (arg("--models") || "fast").split(",").map((s) => s.trim()).filter(Boolean) as VeoKey[];

  let prompt: string;
  let nm = name || "clip";
  if (file) {
    const brief = JSON.parse(fs.readFileSync(file, "utf-8")) as VideoBrief;
    if (brand) brief.brand = brand;
    prompt = buildVideoPrompt(brief);
    nm = name || file.split(/[\\/]/).pop()!.replace(/\.json$/, "");
  } else if (rawPrompt) {
    prompt = rawPrompt;
  } else {
    console.error("❌ Pass --file <brief.json> or --prompt <text>."); process.exit(1); return;
  }

  for (const m of models) {
    if (!VEO_MODELS[m]) { console.log(`⚠ unknown model "${m}" — skip`); continue; }
  }
  console.log(`\n🎬 ${nm}  |  seed: ${image ? "image-to-video" : "text-to-video"}  |  tiers: ${models.join(", ")}\n`);

  const results: { model: VeoKey; file?: string; sec?: number; mb?: number; err?: string }[] = [];
  for (const m of models) {
    if (!VEO_MODELS[m]) continue;
    process.stdout.write(`• ${VEO_LABEL[m]} … rendering`);
    try {
      const r = await generateVideo({
        prompt, imagePath: image, refPaths, outDir: out, name: nm, model: m, aspect, resolution,
        onTick: () => process.stdout.write("."),
      });
      console.log(` ✅ ${r.file.split(/[\\/]/).pop()}  (${Math.round(r.bytes / 1024 / 1024 * 10) / 10} MB, ${Math.round(r.seconds)}s)`);
      results.push({ model: m, file: r.file, sec: r.seconds, mb: r.bytes / 1024 / 1024 });
    } catch (err) {
      console.log(` ❌ ${err instanceof Error ? err.message : err}`);
      results.push({ model: m, err: err instanceof Error ? err.message : String(err) });
    }
  }

  console.log("\n— Summary —");
  for (const r of results) console.log(`  ${VEO_LABEL[r.model]}: ${r.file ? `${r.file.split(/[\\/]/).pop()} (${Math.round((r.mb || 0) * 10) / 10}MB, ${Math.round(r.sec || 0)}s)` : `FAILED — ${r.err}`}`);
}

main();
