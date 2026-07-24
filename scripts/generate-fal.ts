/**
 * scripts/generate-fal.ts
 *
 * fal.ai image generation CLI — a sibling to `pnpm img` (Imagen) that routes
 * through fal models (FLUX by default). ZERO Supabase. Integrates the Prompt
 * Engine so brand profiles + briefs work exactly like `pnpm prompt`.
 *
 *   pnpm fal "a neon pickle mascot, dark studio bg"
 *   pnpm fal --model flux-pro "product hero shot" --aspect 1:1
 *   pnpm fal --brand quiet-desk --json '{"subject":"product box hero shot"}'
 *   pnpm fal --models                      # list model aliases
 *
 * Flags:
 *   --model <alias|id>  fal model (alias from FAL_IMAGE_MODELS or full fal ID).
 *                       Default flux-dev.
 *   --brand <name>      Apply a brand profile (runs the brief through the Prompt Engine)
 *   --json '<obj>'      Inline ImageBrief JSON (built via buildImagePrompt)
 *   --aspect <ratio>    Aspect ratio (default 1:1). Snaps to nearest fal preset.
 *   --out <dir>         Output dir (default $MACRO_PICKLE_EXPORT_DIR, else ./generated-images)
 *   -n, --count <n>     Images to generate (default 1)
 *   --save              Export the prompt to your vault (Obsidian-flavored markdown)
 *   --title <name>      Note title used by --save
 *   --models            List model aliases and exit
 *
 * Requires FAL_KEY in .env.local.
 */

import { config as loadEnv } from "dotenv";
import { generateFalImage, FAL_IMAGE_MODELS } from "./lib/fal.js";
import { buildImagePrompt } from "./lib/prompts/image.js";
import { exportPromptToVault } from "./lib/prompts/export.js";
import type { ImageBrief } from "./lib/prompts/types.js";

loadEnv({ path: ".env.local" });
loadEnv();

interface Args {
  prompt?: string;
  brand?: string;
  json?: string;
  model?: string;
  aspect?: string;
  out?: string;
  count: number;
  save: boolean;
  title?: string;
  listModels: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { count: 1, save: false, listModels: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "--model":
        args.model = argv[++i];
        break;
      case "--brand":
        args.brand = argv[++i];
        break;
      case "--json":
        args.json = argv[++i];
        break;
      case "--aspect":
        args.aspect = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "-n":
      case "--count":
        args.count = Math.max(1, parseInt(argv[++i] ?? "1", 10) || 1);
        break;
      case "--save":
        args.save = true;
        break;
      case "--title":
        args.title = argv[++i];
        break;
      case "--models":
        args.listModels = true;
        break;
      default:
        positional.push(a);
    }
  }
  if (positional.length > 0) args.prompt = positional.join(" ");
  return args;
}

/** Resolve the final prompt + aspect: a brand/brief runs the Prompt Engine, a
 *  positional string is used verbatim. */
function resolvePrompt(args: Args): { prompt: string; aspect: string; brief?: unknown } {
  if (args.brand || args.json) {
    const brief: Record<string, unknown> = args.json ? JSON.parse(args.json) : {};
    if (args.brand) brief.brand = args.brand;
    if (args.aspect) brief.aspect = args.aspect;
    if (!brief.subject && args.prompt) brief.subject = args.prompt;
    const built = buildImagePrompt(brief as unknown as ImageBrief);
    return { prompt: built.prompt, aspect: built.aspect, brief };
  }
  if (!args.prompt) {
    throw new Error(
      'No prompt provided. Pass one (pnpm fal "...") or use --brand/--json. See --models for model aliases.'
    );
  }
  return { prompt: args.prompt, aspect: args.aspect ?? "1:1" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listModels) {
    console.log(
      "fal image model aliases:\n" +
        Object.entries(FAL_IMAGE_MODELS)
          .map(([alias, id]) => `  - ${alias.padEnd(16)} → ${id}`)
          .join("\n") +
        "\n\n(or pass any full fal model ID to --model)"
    );
    return;
  }

  if (!process.env.FAL_KEY) {
    console.error("❌ FAL_KEY is not set. Add it to .env.local.");
    process.exit(1);
  }

  let resolved: { prompt: string; aspect: string; brief?: unknown };
  try {
    resolved = resolvePrompt(args);
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`\n${resolved.prompt}\n\n(aspect ${resolved.aspect})`);

  if (args.save) {
    const file = exportPromptToVault({
      kind: "image",
      title: args.title || args.prompt || "fal image prompt",
      prompt: resolved.prompt,
      brand: args.brand,
      aspect: resolved.aspect,
      tool: `fal.ai (${args.model ?? "flux-dev"})`,
      brief: resolved.brief,
    });
    console.log(`\n📓 Saved to vault: ${file}`);
  }

  const outDir = args.out || process.env.MACRO_PICKLE_EXPORT_DIR || "generated-images";
  console.log(`\n🎨 Generating via fal (${args.model ?? "flux-dev"}) → ${outDir}`);
  try {
    const files = await generateFalImage({
      prompt: resolved.prompt,
      model: args.model,
      aspect: resolved.aspect,
      count: args.count,
      outDir,
      name: args.title || args.brand || resolved.prompt,
    });
    for (const f of files) console.log(`   ✅ ${f.filename} (${Math.round(f.bytes / 1024)} KB)`);
  } catch (err) {
    console.error(`   ❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
