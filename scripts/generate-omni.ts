/**
 * scripts/generate-omni.ts  —  `pnpm omni`
 *
 * Gemini Omni Flash: conversational video generation + EDITING. The headline
 * use is video manipulation — feed a reference clip, describe the change in
 * plain language, get an edited MP4. Chain refinements with --continue.
 *
 *   # Edit a reference video
 *   pnpm omni --video "path/to/ref.mp4" --prompt "Replace the mug with the product from the reference, keep the camera move"
 *
 *   # Generate, then refine conversationally
 *   pnpm omni --prompt "A woman playing violin outdoors" --name violin
 *   pnpm omni --continue <interaction-id> --prompt "Make it golden hour, slow dolly-in"
 *
 *   # Director Brief + brand profile (same as veo/kling)
 *   pnpm omni --file content/briefs/<brief>.json --brand quiet-desk --image ".../ref.jpg"
 *
 * Flags:
 *   --prompt <text>                Instruction (generation or edit)
 *   --file <brief.json>            Director Brief (builds prompt via Prompt Engine)
 *   --brand <name>                 Brand profile when using --file
 *   --video <path>                 Source video to EDIT (uploaded via Files API)
 *   --image <p1,p2,...>            Reference image(s) — subject lock / i2v seed
 *   --continue <interaction-id>    Multi-turn edit of a previous omni result
 *   --task <mode>                  text_to_video | image_to_video | reference_to_video | edit
 *   --aspect 16:9|9:16             Output aspect (default 16:9)
 *   --duration <e.g. 8s>           Output duration hint
 *   --name <slug>                  Output filename slug
 *   --out <dir>                    Render into ANY local folder, e.g. --out "~/Pictures".
 *                                  Default: MACRO_PICKLE_OMNI_DIR, else MACRO_PICKLE_EXPORT_DIR/omni-clips,
 *                                  else ./omni-clips
 *   --dry-run                      Print prompt + cost estimate, don't call the API
 *
 * ⚠️  PAID TIER ONLY — no free tier ($0.10/s of output). Enable billing on the
 *     GOOGLE_API_KEY project or every call is rejected.
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { buildVideoPrompt } from "./lib/prompts/video.js";
import { estimateOmniCost, generateOmniVideo, type OmniTask } from "./lib/omni.js";
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
  const video = arg("--video");
  const images = arg("--image")?.split(",").map((s) => s.trim()).filter(Boolean);
  const previous = arg("--continue");
  const task = arg("--task") as OmniTask | undefined;
  const aspect = (arg("--aspect") ?? "16:9") as "16:9" | "9:16";
  const duration = arg("--duration");
  const name = arg("--name");
  const dryRun = hasFlag("--dry-run");
  // Output dir: explicit --out > persistent user choice (MACRO_PICKLE_OMNI_DIR,
  // e.g. ~/Pictures) > iCloud export mirror > ./omni-clips.
  const out =
    arg("--out") ??
    process.env.MACRO_PICKLE_OMNI_DIR ??
    (process.env.MACRO_PICKLE_EXPORT_DIR
      ? `${process.env.MACRO_PICKLE_EXPORT_DIR}/omni-clips`
      : "omni-clips");

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
    console.error("❌ Pass --prompt <text> or --file <brief.json>.");
    process.exit(1);
    return;
  }

  for (const p of [video, ...(images ?? [])].filter(Boolean) as string[]) {
    if (!fs.existsSync(p)) {
      console.error(`❌ Input not found: ${p}`);
      process.exit(1);
    }
  }

  const mode = previous
    ? `conversational edit (continues ${previous})`
    : video
      ? "video edit"
      : images?.length
        ? "image/reference-to-video"
        : "text-to-video";

  const outSec = duration ? parseFloat(duration) || 8 : 8;
  const est = estimateOmniCost({ outputSeconds: outSec, imageCount: images?.length ?? 0 });

  console.log(`\n🎞️  Omni Flash  |  mode: ${mode}  |  aspect: ${aspect}${task ? `  |  task: ${task}` : ""}`);
  console.log(`   est. cost: ~$${est.usd.toFixed(2)}  (${est.breakdown}; input video billed extra at ~$0.009/s)`);
  console.log(`   out: ${out}`);
  console.log(`   prompt: ${prompt.length > 200 ? prompt.slice(0, 200) + "…" : prompt}\n`);

  if (dryRun) {
    console.log("— dry run, no API call —");
    return;
  }

  try {
    const r = await generateOmniVideo({
      prompt,
      videoPath: video,
      imagePaths: images,
      previousInteractionId: previous,
      task,
      aspect,
      duration,
      outDir: out,
      name: nm,
      onStatus: (m) => console.log(`   … ${m}`),
    });
    const mb = Math.round((r.bytes / 1024 / 1024) * 10) / 10;
    console.log(`\n✅ ${r.file}  (${mb} MB, ${Math.round(r.seconds)}s)`);
    console.log(`   interaction id: ${r.interactionId}`);
    console.log(`   refine it:  pnpm omni --continue ${r.interactionId} --prompt "<next change>"`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      console.error(
        `\n❌ ${msg}\n\n💳 Omni Flash has NO free tier — this key must be on a billed project.` +
          `\n   Enable billing at https://aistudio.google.com/ (project settings) and retry.`
      );
    } else {
      console.error(`\n❌ ${msg}`);
    }
    process.exit(1);
  }
}

main();
