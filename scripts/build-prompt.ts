/**
 * scripts/build-prompt.ts
 *
 * Build a model-ready prompt from a structured brief using the Prompt Engine,
 * print it, and (for images) optionally generate it. ZERO Supabase.
 *
 *   pnpm prompt --image --json '{"subject":"a neon pickle mascot","context":"dark studio"}'
 *   pnpm prompt --image --brand quiet-desk --json '{"subject":"product box hero shot"}' --gen
 *   pnpm prompt --video --file brief.json
 *   pnpm prompt --video --brand quiet-desk --json '{"scene":"studio","subject":"the coin","intent":"product"}'
 *   pnpm prompt --brands         # list available brand profiles
 *
 * Flags:
 *   --image | --video   Which builder to run (default --image)
 *   --json '<obj>'      Inline JSON brief (ImageBrief or VideoBrief shape)
 *   --file <path>       Read the JSON brief from a file
 *   --brand <name>      Apply a brand profile (merged into the brief)
 *   --gen               (image only) Generate the built prompt via Imagen 4.0
 *   --save              Export the prompt to your vault (Obsidian-flavored markdown)
 *   --title <name>      Note title used by --save
 *   --aspect <ratio>    Override aspect ratio
 *   --out <dir>         (with --gen) output dir; default $MACRO_PICKLE_EXPORT_DIR
 *   --brands            List brand profiles and exit
 *
 * Exported prompts are written as Obsidian-flavored markdown to the
 * vault (see --save). Override the destination with MACRO_PICKLE_PROMPT_VAULT.
 * Requires GOOGLE_API_KEY only when --gen is used.
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import path from "path";
import { buildImagePrompt } from "./lib/prompts/image.js";
import { buildVideoPrompt } from "./lib/prompts/video.js";
import { listBrandProfiles } from "./lib/prompts/brand.js";
import { exportPromptToVault } from "./lib/prompts/export.js";
import { lyricFor } from "./lib/lyrics.js";
import { generateImage } from "./lib/imagen.js";
import type { ImageBrief, VideoBrief } from "./lib/prompts/types.js";

loadEnv({ path: ".env.local" });
loadEnv();

interface Args {
  mode: "image" | "video";
  json?: string;
  file?: string;
  brand?: string;
  aspect?: string;
  out?: string;
  title?: string;
  gen: boolean;
  save: boolean;
  listBrands: boolean;
  /** Explicit lyric-sync shot key (overrides filename-derived key). */
  lyricKey?: string;
  /** Lyric track to sync from (content/lyrics/<track>.json). */
  track?: string;
  /** Suppress lyric auto-attach. */
  noLyric: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { mode: "image", gen: false, save: false, listBrands: false, noLyric: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--image":
        args.mode = "image";
        break;
      case "--video":
        args.mode = "video";
        break;
      case "--json":
        args.json = argv[++i];
        break;
      case "--file":
        args.file = argv[++i];
        break;
      case "--brand":
        args.brand = argv[++i];
        break;
      case "--aspect":
        args.aspect = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "--title":
        args.title = argv[++i];
        break;
      case "--gen":
        args.gen = true;
        break;
      case "--save":
        args.save = true;
        break;
      case "--brands":
        args.listBrands = true;
        break;
      case "--lyric-key":
        args.lyricKey = argv[++i];
        break;
      case "--track":
        args.track = argv[++i];
        break;
      case "--no-lyric":
        args.noLyric = true;
        break;
      default:
        break;
    }
  }
  return args;
}

function loadBrief(args: Args): Record<string, unknown> {
  let raw: string | undefined = args.json;
  if (!raw && args.file) {
    if (!fs.existsSync(args.file)) {
      throw new Error(`Brief file not found: ${args.file}`);
    }
    raw = fs.readFileSync(args.file, "utf-8");
  }
  if (!raw) {
    throw new Error(
      "No brief provided. Pass --json '<obj>' or --file <path>. See --help in the file header."
    );
  }
  const parsed = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Brief must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listBrands) {
    const brands = listBrandProfiles();
    console.log(
      brands.length
        ? `Brand profiles:\n${brands.map((b) => `  - ${b}`).join("\n")}`
        : "No brand profiles found in content/brands/"
    );
    return;
  }

  let briefObj: Record<string, unknown>;
  try {
    briefObj = loadBrief(args);
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  // Merge CLI overrides into the brief.
  if (args.brand) briefObj.brand = args.brand;
  if (args.aspect) briefObj.aspect = args.aspect;

  if (args.mode === "video") {
    const brief = briefObj as unknown as VideoBrief;
    // Lyric-sync (opt-in): when --track <name> is given, attach the synced bar(s) as
    // an audio-bed note. Key comes from --lyric-key, else the --file basename. Suppress
    // with --no-lyric. Reads content/lyrics/<track>.json (absent → no-op).
    if (!args.noLyric && brief.lyric === undefined && args.track) {
      const key =
        args.lyricKey ??
        (args.file ? path.basename(args.file).replace(/\.json$/i, "") : undefined);
      if (key) {
        const ly = lyricFor(key, args.track);
        if (ly) brief.lyric = ly;
      }
    }
    const prompt = buildVideoPrompt(brief);
    console.log(prompt);
    if (args.save) {
      const file = exportPromptToVault({
        kind: "video",
        title: args.title || String(briefObj.subject ?? "video prompt"),
        prompt,
        brand: args.brand,
        aspect: brief.aspect,
        brief: briefObj,
      });
      console.log(`\n📓 Saved to vault: ${file}`);
    }
    return;
  }

  const built = buildImagePrompt(briefObj as unknown as ImageBrief);
  console.log(`\n${built.prompt}\n\n(aspect ${built.aspect})`);

  if (args.save) {
    const file = exportPromptToVault({
      kind: "image",
      title: args.title || String(briefObj.subject ?? "image prompt"),
      prompt: built.prompt,
      brand: args.brand,
      aspect: built.aspect,
      brief: briefObj,
    });
    console.log(`\n📓 Saved to vault: ${file}`);
  }

  if (args.gen) {
    if (!process.env.GOOGLE_API_KEY) {
      console.error("\n❌ --gen requires GOOGLE_API_KEY in .env.local");
      process.exit(1);
    }
    const outDir =
      args.out || process.env.MACRO_PICKLE_EXPORT_DIR || "generated-images";
    console.log(`\n🎨 Generating → ${outDir}`);
    try {
      const files = await generateImage({
        prompt: built.prompt,
        aspect: built.aspect,
        outDir,
        name: String(briefObj.subject ?? "prompt"),
      });
      for (const f of files) console.log(`   ✅ ${f.filename}`);
    } catch (err) {
      console.error(`   ❌ ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  }
}

main();
