import "./load-env";
import {
  sceneExists,
  saveScene,
  manifestPath,
  makeId,
} from "../lib/pipeline/scene-store";
import { getPreset, presetNames } from "../lib/pipeline/style-presets";
import type { SceneManifest } from "../lib/pipeline/types";

/**
 * Scaffold a new scene with a template scene.json you then edit.
 *
 *   pnpm scene:new <slug> --title "Jessica Rabbit Drop" [--preset streetwear-product]
 */

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function nowIso(): string {
  return new Date().toISOString();
}

const slug = process.argv[2];
if (!slug || slug.startsWith("--")) {
  console.error('Usage: pnpm scene:new <slug> [--title "Scene Title"]');
  process.exit(1);
}

if (sceneExists(slug)) {
  console.error(`❌ Scene "${slug}" already exists at ${manifestPath(slug)}`);
  process.exit(1);
}

const title = arg("--title") ?? slug;

const presetName = arg("--preset");
const preset = presetName ? getPreset(presetName) : undefined;
if (presetName && !preset) {
  console.error(
    `❌ Unknown preset "${presetName}". Available: ${presetNames().join(", ")}`
  );
  process.exit(1);
}

const scene: SceneManifest = {
  slug,
  title,
  description: "",
  createdAt: nowIso(),
  reference: {
    model: "nano-banana-pro",
    aspectRatio: preset?.aspectRatio ?? "16:9",
    style: preset?.style ?? "",
    negativePrompt:
      preset?.negativePrompt ?? "blurry, low quality, distorted text, extra fingers",
    enhance: true,
    prompts: [
      {
        id: makeId("rp"),
        text: "Describe the reference frame you want — subject, setting, mood.",
        count: 4,
        kind: "general",
      },
    ],
  },
  video: {
    model: "veo-3.1",
    aspectRatio: "16:9",
    resolution: "1080p",
    negativePrompt: "",
    generateAudio: true,
    enhance: true,
    useSelectedAs: "ingredients",
    groundWithVision: true,
    prompts: [
      {
        id: makeId("vp"),
        text: "Describe the motion/action for the video using the selected reference frames.",
      },
    ],
  },
  media: [],
};

saveScene(scene);

console.log(`✅ Created scene "${slug}"`);
console.log(`   ${manifestPath(slug)}\n`);
console.log("Next steps:");
console.log(`  1. Edit scene.json — write your reference prompt(s) and tune model/aspect/style.`);
console.log(`  2. pnpm scene:refs ${slug}        # generate reference candidates`);
console.log(`  3. pnpm scene:select ${slug}      # list candidates, then select the keepers`);
console.log(`  4. pnpm scene:video ${slug}       # generate video from selected frames`);
