/**
 * scripts/generate-image-local.ts
 *
 * Standalone reference-image generator. ZERO Supabase — prompts go straight to
 * Imagen 4.0 and the PNGs are written to a local folder (point it at iCloud via
 * MACRO_PICKLE_EXPORT_DIR so they sync to your phone).
 *
 * Prompt sources (pick either):
 *   1. CLI argument:   pnpm img "a neon pickle mascot, dark studio bg"
 *   2. Prompts file:   pnpm img --file prompts.txt
 *                      (auto-detects ./prompts.txt or ./prompts.json if no
 *                       positional prompt and no --file given)
 *
 * Flags:
 *   --file <path>     Read prompts from a file (.txt = one per line; .json =
 *                     array of strings OR array of { name?, prompt })
 *   --out <dir>       Output dir (default: $MACRO_PICKLE_EXPORT_DIR, else ./generated-images)
 *   --aspect <ratio>  Imagen aspect ratio (default 16:9). e.g. 1:1, 9:16, 4:3
 *   -n, --count <n>   Images per prompt (default 1)
 *
 * Requires: GOOGLE_API_KEY
 */

import { config as loadEnv } from "dotenv";
import fs from "fs";
import { generateImage } from "./lib/imagen.js";

// Load .env.local first (project convention), then .env as fallback.
// dotenv does not override already-set vars, so a pre-loaded shell wins.
loadEnv({ path: ".env.local" });
loadEnv();

// ---------------------------------------------------------------------------
// Arg parsing (tiny, dependency-free)
// ---------------------------------------------------------------------------

interface Args {
  prompt?: string;
  file?: string;
  out?: string;
  aspect: string;
  count: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { aspect: "16:9", count: 1 };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--file":
        args.file = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "--aspect":
        args.aspect = argv[++i] ?? args.aspect;
        break;
      case "-n":
      case "--count":
        args.count = Math.max(1, parseInt(argv[++i] ?? "1", 10) || 1);
        break;
      default:
        positional.push(a!);
    }
  }

  if (positional.length > 0) args.prompt = positional.join(" ");
  return args;
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

interface PromptItem {
  name?: string;
  prompt: string;
}

function loadFromFile(file: string): PromptItem[] {
  if (!fs.existsSync(file)) {
    throw new Error(`Prompts file not found: ${file}`);
  }
  const raw = fs.readFileSync(file, "utf-8");

  if (file.endsWith(".json")) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON prompts file must be an array");
    }
    return parsed.map((entry: unknown) =>
      typeof entry === "string" ? { prompt: entry } : (entry as PromptItem)
    );
  }

  // .txt (or anything else): one prompt per line, skip blanks and # comments
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((prompt) => ({ prompt }));
}

function resolvePrompts(args: Args): PromptItem[] {
  if (args.prompt) return [{ prompt: args.prompt }];
  if (args.file) return loadFromFile(args.file);

  // Auto-detect a prompts file in the cwd
  for (const candidate of ["prompts.txt", "prompts.json"]) {
    if (fs.existsSync(candidate)) {
      console.log(`📄 No prompt given — using ${candidate}`);
      return loadFromFile(candidate);
    }
  }

  throw new Error(
    'No prompt provided. Pass one as an argument (pnpm img "...") or add a prompts.txt / prompts.json file, or use --file <path>.'
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ GOOGLE_API_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  const outDir =
    args.out || process.env.MACRO_PICKLE_EXPORT_DIR || "generated-images";

  let prompts: PromptItem[];
  try {
    prompts = resolvePrompts(args);
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`🎨 Generating ${prompts.length} prompt(s) → ${outDir}`);
  console.log(`   aspect=${args.aspect} count=${args.count}/prompt\n`);

  let saved = 0;
  let failed = 0;

  for (let i = 0; i < prompts.length; i++) {
    const item = prompts[i]!;
    const preview =
      item.prompt.slice(0, 60) + (item.prompt.length > 60 ? "…" : "");
    console.log(`  🖼️  [${i + 1}/${prompts.length}] "${preview}"`);

    try {
      const files = await generateImage({
        prompt: item.prompt,
        name: item.name,
        outDir,
        count: args.count,
        aspect: args.aspect,
      });
      for (const f of files) {
        console.log(`     ✅ ${f.filename}`);
        saved++;
      }
    } catch (err) {
      console.error(`     ❌ Failed:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }

  console.log(`\n✨ Done: ${saved} image(s) saved, ${failed} failed → ${outDir}`);
}

main();
