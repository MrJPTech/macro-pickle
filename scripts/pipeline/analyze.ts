import "./load-env";
import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";
import {
  loadScene,
  selectedReferences,
  referenceCandidates,
  readMediaBuffer,
  mediaName,
} from "../lib/pipeline/scene-store";
import { groundFrames, type FrameInput } from "../lib/vision";
import { PromptEnhancer } from "../lib/pipeline/prompt-enhancer";

/**
 * Analyze frames → understanding → a suggested reference-photo prompt.
 *
 *   pnpm scene:analyze <slug>                 # analyze a scene's selected frames
 *   pnpm scene:analyze --image a.png b.jpg    # analyze arbitrary local images
 *
 * Flags:
 *   --prompt        also emit a suggested Stage-1 reference prompt (image→prompt)
 *   --aspect 16:9   aspect ratio hint for the suggested prompt
 */

function flag(name: string): boolean {
  return process.argv.includes(name);
}
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function mimeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "image/png";
}

function imageArgs(): string[] {
  const i = process.argv.indexOf("--image");
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < process.argv.length; j++) {
    const v = process.argv[j];
    if (!v || v.startsWith("--")) break;
    out.push(v);
  }
  return out;
}

async function main(): Promise<void> {
  const images: FrameInput[] = [];
  const labels: string[] = [];

  const imgPaths = imageArgs();
  if (imgPaths.length > 0) {
    for (const p of imgPaths) {
      images.push({ buffer: readFileSync(p), mimeType: mimeFromPath(p) });
      labels.push(basename(p));
    }
  } else {
    const slug = process.argv[2];
    if (!slug || slug.startsWith("--")) {
      console.error(
        "Usage: pnpm scene:analyze <slug> [--prompt]  |  pnpm scene:analyze --image a.png ... [--prompt]"
      );
      process.exit(1);
    }
    const scene = loadScene(slug);
    const picked = selectedReferences(scene);
    const source = picked.length > 0 ? picked : referenceCandidates(scene);
    if (source.length === 0) {
      console.error(`No frames to analyze in "${slug}". Run: pnpm scene:refs ${slug}`);
      process.exit(1);
    }
    for (const m of source) {
      images.push({ buffer: readMediaBuffer(slug, m), mimeType: m.mimeType });
      labels.push(mediaName(m));
    }
    console.log(
      `🔍 Analyzing ${source.length} ${picked.length ? "selected" : "candidate"} frame(s) from "${scene.title}"`
    );
  }

  console.log(`   frames: ${labels.join(", ")}\n`);

  const analysis = await groundFrames(images);

  console.log("📋 Analysis");
  console.log(`   caption:  ${analysis.caption}`);
  console.log(`   subjects: ${analysis.subjects.join(", ") || "—"}`);
  console.log(`   text:     ${analysis.detectedText.join(" | ") || "—"}`);
  console.log(`   palette:  ${analysis.palette.join(", ") || "—"}`);
  console.log(`   lighting: ${analysis.lighting || "—"}`);
  console.log(`   grounding: ${analysis.groundingSummary}\n`);

  if (flag("--prompt")) {
    const enhancer = new PromptEnhancer();
    const suggestion = await enhancer.enhanceImagePrompt(analysis.groundingSummary, {
      aspectRatio: arg("--aspect"),
    });
    console.log("✨ Suggested reference-photo prompt (drop into scene.json reference.prompts):");
    console.log(`\n${suggestion.prompt}\n`);
  } else {
    console.log("Tip: add --prompt to also generate a ready-to-use reference prompt.");
  }
}

main().catch((err) => {
  console.error("❌ Analyze failed:", err);
  process.exit(1);
});
