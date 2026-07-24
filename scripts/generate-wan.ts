/**
 * scripts/generate-wan.ts  —  `pnpm wan`
 *
 * Render clips via Wan 2.7 (fal.ai) — the frontier value pick ($0.10/s @720p,
 * $0.15/s @1080p). Text-to-video, image-to-video with first→last keyframes, and
 * v2v EDIT (restyle / scene-mod a source clip). PAID.
 *
 *   pnpm wan --prompt "Product hero, slow push-in" --resolution 720p --duration 6
 *   pnpm wan --file content/briefs/<b>.json --brand quiet-desk --image first.png --end-image last.png
 *   pnpm wan --video clip.mp4 --prompt "restyle to golden-hour, keep the motion"   # v2v edit
 *   pnpm wan --prompt "…" --dry-run                                                # estimate only
 *
 * Flags:
 *   --file <brief.json> | --prompt <text> | --brand <name>
 *   --image <path> / --image-url <url>       First frame (i2v)
 *   --end-image <path> / --end-image-url <url>  Last frame (first→last)
 *   --video <path> / --video-url <url>       Source clip → v2v EDIT mode
 *   --audio <path> / --audio-url <url>       Drive-audio track
 *   --models <csv>        t2v | i2v | edit  (default inferred from inputs)
 *   --resolution 720p|1080p (default 1080p) | --duration <2-15> (default 5)
 *   --negative <text> | --seed <n> | --name <slug> | --out <dir>
 *   --dry-run             Print the cost estimate and exit (no API call)
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { buildVideoPrompt } from "./lib/prompts/video.js";
import { generateWanVideo, estimateWanCost, type WanResolution } from "./lib/wan.js";
import { WAN_MODELS, WAN_LABEL, type WanKey } from "./lib/model-ids.js";
import type { VideoBrief } from "./lib/prompts/types.js";

loadEnv({ path: ".env.local" });
loadEnv();

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const hasFlag = (f: string) => process.argv.includes(f);

async function main() {
  const file = arg("--file");
  const rawPrompt = arg("--prompt");
  const brand = arg("--brand");
  const image = arg("--image");
  const imageUrl = arg("--image-url");
  const endImage = arg("--end-image");
  const endImageUrl = arg("--end-image-url");
  const video = arg("--video");
  const videoUrl = arg("--video-url");
  const audio = arg("--audio");
  const audioUrl = arg("--audio-url");
  const resolution = (arg("--resolution") ?? "1080p") as WanResolution;
  const duration = arg("--duration") ? Number(arg("--duration")) : 5;
  const negative = arg("--negative");
  const seed = arg("--seed") ? Number(arg("--seed")) : undefined;
  const name = arg("--name");
  const dryRun = hasFlag("--dry-run");
  const out =
    arg("--out") ??
    (process.env.MACRO_PICKLE_EXPORT_DIR ? `${process.env.MACRO_PICKLE_EXPORT_DIR}/wan-clips` : "wan-clips");

  const hasVideo = !!(video || videoUrl);
  const hasImage = !!(image || imageUrl);
  const defaultModel: WanKey = hasVideo ? "edit" : hasImage ? "i2v" : "t2v";
  const models = (arg("--models") ?? defaultModel).split(",").map((s) => s.trim()).filter(Boolean) as WanKey[];

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

  const unknowns = models.filter((m) => !WAN_MODELS[m]);
  if (unknowns.length) {
    console.error(`❌ Unknown model(s): ${unknowns.join(", ")}. Valid: ${Object.keys(WAN_MODELS).join(", ")}`);
    process.exit(1);
  }

  const perClip = estimateWanCost(duration, resolution);
  const total = perClip * models.length;
  const mode = hasVideo ? "v2v-edit" : hasImage ? `image-to-video${endImage || endImageUrl ? " (first→last)" : ""}` : "text-to-video";
  console.log(`\n🎬 ${nm}  |  mode: ${mode}  |  ${resolution} · ${duration}s  |  models: ${models.join(", ")}`);
  console.log(`   💵 est. ~$${perClip.toFixed(2)}/clip → ~$${total.toFixed(2)} for ${models.length} model(s) — PAID fal.ai spend\n`);

  if (dryRun) {
    console.log("✅ Dry-run — no API call made. Remove --dry-run to render.\n");
    return;
  }

  const results: { model: WanKey; file?: string; sec?: number; mb?: number; usd?: number; err?: string }[] = [];
  for (const m of models) {
    process.stdout.write(`• ${WAN_LABEL[m]} … rendering`);
    try {
      const r = await generateWanVideo({
        prompt, imagePath: image, imageUrl, endImagePath: endImage, endImageUrl,
        videoPath: video, videoUrl, audioPath: audio, audioUrl,
        resolution, duration, negative, seed, outDir: out, name: nm, model: m,
        onTick: () => process.stdout.write("."),
      });
      const mb = Math.round((r.bytes / 1048576) * 10) / 10;
      console.log(` ✅ ${r.file.split(/[\\/]/).pop()}  (${mb} MB, ${Math.round(r.seconds)}s, ~$${r.estimatedCostUsd.toFixed(2)})`);
      results.push({ model: m, file: r.file, sec: r.seconds, mb: r.bytes / 1048576, usd: r.estimatedCostUsd });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(` ❌ ${msg}`);
      results.push({ model: m, err: msg });
    }
  }

  console.log("\n— Summary —");
  let spent = 0;
  for (const r of results) {
    if (r.file) {
      spent += r.usd ?? 0;
      console.log(`  ${WAN_LABEL[r.model]}: ${r.file.split(/[\\/]/).pop()} (${Math.round((r.mb ?? 0) * 10) / 10}MB, ~$${(r.usd ?? 0).toFixed(2)})`);
    } else {
      console.log(`  ${WAN_LABEL[r.model]}: FAILED — ${r.err}`);
    }
  }
  console.log(`  ~$${spent.toFixed(2)} spent\n`);
}

main();
