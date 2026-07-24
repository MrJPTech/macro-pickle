/**
 * scripts/generate-seedance.ts  —  `pnpm seedance`
 *
 * Render clips via Seedance 2.0 (fal.ai). Mirrors generate-kling.ts: reads a
 * Director Brief JSON or a raw --prompt, seeds with an optional --image, and can
 * lock a --end-image for start→end interpolation. PAID (no free tier).
 *
 *   pnpm seedance --file content/briefs/<brief>.json --brand quiet-desk \
 *                 --image ".../first.png" --end-image ".../last.png" --duration 8
 *   pnpm seedance --prompt "Collapsible bucket, studio hero" --models t2v --resolution 720p
 *   pnpm seedance --prompt "…" --image seed.png --dry-run     # estimate only, no spend
 *
 * Flags:
 *   --file <brief.json> | --prompt <text> | --brand <name>
 *   --image <path>        First frame (triggers i2v; enables --end-image)
 *   --end-image <path>    Last frame — start→END keyframe interpolation (i2v only)
 *   --models <csv>        i2v | t2v  (default: i2v if --image else t2v)
 *   --duration <n|auto>   Seconds 4–15, or "auto" (default auto)
 *   --resolution <r>      480p | 720p | 1080p (default 1080p)
 *   --aspect <r>          auto|21:9|16:9|4:3|1:1|3:4|9:16
 *   --seed <n>            Deterministic seed
 *   --name <slug> | --out <dir> | --no-audio
 *   --dry-run             Print the cost estimate and exit (no API call)
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { buildVideoPrompt } from "./lib/prompts/video.js";
import {
  generateSeedanceVideo,
  estimateSeedanceCost,
  type SeedanceDuration,
  type SeedanceResolution,
} from "./lib/seedance.js";
import { SEEDANCE_MODELS, SEEDANCE_LABEL, type SeedanceKey } from "./lib/model-ids.js";
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
  const endImage = arg("--end-image");
  const durationArg = arg("--duration");
  const duration: SeedanceDuration = durationArg ? (durationArg === "auto" ? "auto" : Number(durationArg)) : "auto";
  const resolution = (arg("--resolution") ?? "1080p") as SeedanceResolution;
  const aspect = arg("--aspect") as SeedanceOptionsAspect | undefined;
  const seed = arg("--seed") ? Number(arg("--seed")) : undefined;
  const name = arg("--name");
  const noAudio = hasFlag("--no-audio");
  const dryRun = hasFlag("--dry-run");
  const out =
    arg("--out") ??
    (process.env.MACRO_PICKLE_EXPORT_DIR ? `${process.env.MACRO_PICKLE_EXPORT_DIR}/seedance-clips` : "seedance-clips");

  const defaultModel: SeedanceKey = image ? "i2v" : "t2v";
  const models = (arg("--models") ?? defaultModel).split(",").map((s) => s.trim()).filter(Boolean) as SeedanceKey[];

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

  const unknowns = models.filter((m) => !SEEDANCE_MODELS[m]);
  if (unknowns.length) {
    console.error(`❌ Unknown model(s): ${unknowns.join(", ")}. Valid: ${Object.keys(SEEDANCE_MODELS).join(", ")}`);
    process.exit(1);
  }

  const perClip = estimateSeedanceCost(duration, resolution);
  const total = perClip * models.length;
  console.log(
    `\n🎬 ${nm}  |  mode: ${image ? "image-to-video" : "text-to-video"}${endImage ? " (start→end)" : ""}  |  ${resolution} · ${duration}s  |  models: ${models.join(", ")}`
  );
  console.log(`   💵 est. ~$${perClip.toFixed(2)}/clip → ~$${total.toFixed(2)} for ${models.length} model(s) — PAID fal.ai spend\n`);

  if (dryRun) {
    console.log("✅ Dry-run — no API call made. Remove --dry-run to render.\n");
    return;
  }

  const results: { model: SeedanceKey; file?: string; sec?: number; mb?: number; usd?: number; err?: string }[] = [];
  for (const m of models) {
    process.stdout.write(`• ${SEEDANCE_LABEL[m]} … rendering`);
    try {
      const r = await generateSeedanceVideo({
        prompt, imagePath: image, endImagePath: endImage, duration, resolution,
        aspect, seed, generateAudio: !noAudio, outDir: out, name: nm, model: m,
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
      console.log(`  ${SEEDANCE_LABEL[r.model]}: ${r.file.split(/[\\/]/).pop()} (${Math.round((r.mb ?? 0) * 10) / 10}MB, ~$${(r.usd ?? 0).toFixed(2)})`);
    } else {
      console.log(`  ${SEEDANCE_LABEL[r.model]}: FAILED — ${r.err}`);
    }
  }
  console.log(`  ~$${spent.toFixed(2)} spent\n`);
}

type SeedanceOptionsAspect = NonNullable<Parameters<typeof generateSeedanceVideo>[0]["aspect"]>;

main();
