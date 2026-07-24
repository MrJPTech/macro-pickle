import "./load-env";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  loadScene,
  saveScene,
  addMedia,
  referencesDir,
  makeId,
  referenceCandidates,
} from "../lib/pipeline/scene-store";
import { generateNanoBuffers } from "../lib/nano-banana";
import { PromptEnhancer } from "../lib/pipeline/prompt-enhancer";
import type { MediaRecord } from "../lib/pipeline/types";

/**
 * Stage 1 — generate reference-frame candidates for a scene.
 *
 *   pnpm scene:refs <slug> [--count N] [--no-enhance] [--re-enhance] [--dry-run]
 *
 * Enhanced prompts are cached on the scene manifest (prompt.enhanced) and
 * reused on re-runs — pass --re-enhance to force a fresh Gemini rewrite.
 */

function flag(name: string): boolean {
  return process.argv.includes(name);
}
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug || slug.startsWith("--")) {
    console.error("Usage: pnpm scene:refs <slug> [--count N] [--no-enhance] [--re-enhance] [--dry-run]");
    process.exit(1);
  }

  const scene = loadScene(slug);
  const countOverride = arg("--count") ? Number(arg("--count")) : undefined;
  const doEnhance = scene.reference.enhance && !flag("--no-enhance");
  const dryRun = flag("--dry-run");

  const enhancer = doEnhance ? new PromptEnhancer() : null;

  console.log(`🎨 Stage 1 — reference frames for "${scene.title}" (${slug})`);
  console.log(`   model: ${scene.reference.model} · aspect: ${scene.reference.aspectRatio}`);
  console.log(`   enhance: ${doEnhance ? "on" : "off"}${dryRun ? " · DRY RUN" : ""}\n`);

  const existing = referenceCandidates(scene).length;
  let generated = 0;

  for (const prompt of scene.reference.prompts) {
    const count = countOverride ?? prompt.count ?? 4;
    let finalPrompt = prompt.text;

    if (enhancer && prompt.enhanced && !flag("--re-enhance")) {
      // Reuse the cached enhancement — no repeat Gemini call, deterministic re-runs.
      finalPrompt = prompt.enhanced;
      console.log(`  ♻️  Cached enhanced prompt [${prompt.id}] (--re-enhance to refresh):\n     ${finalPrompt}\n`);
    } else if (enhancer) {
      const result = await enhancer.enhanceImagePrompt(prompt.text, {
        aspectRatio: scene.reference.aspectRatio,
        style: scene.reference.style || undefined,
        negativePrompt: scene.reference.negativePrompt || undefined,
        kind: prompt.kind,
      });
      finalPrompt = result.prompt;
      prompt.enhanced = result.prompt;
      saveScene(scene); // persist immediately so even a dry-run's enhancement is reusable
      console.log(`  ✏️  Enhanced [${prompt.id}]:\n     ${finalPrompt}\n`);
    }

    if (dryRun) {
      console.log(`  (dry-run) would generate ${count} candidate(s) for [${prompt.id}]\n`);
      continue;
    }

    console.log(`  🖼️  Generating ${count} candidate(s) for [${prompt.id}]...`);
    const images = await generateNanoBuffers({
      prompt: finalPrompt,
      count,
      aspect: scene.reference.aspectRatio,
      model: scene.reference.model,
    });

    for (const img of images) {
      const id = makeId("ref");
      const ext = img.mimeType.includes("jpeg") ? "jpg" : "png";
      const fileRel = join("references", `${id}.${ext}`);
      writeFileSync(join(referencesDir(slug), `${id}.${ext}`), img.buffer);

      const record: MediaRecord = {
        id,
        stage: "reference",
        promptId: prompt.id,
        file: fileRel.replace(/\\/g, "/"),
        mimeType: img.mimeType,
        model: img.model,
        rawPrompt: prompt.text,
        finalPrompt,
        params: { aspectRatio: scene.reference.aspectRatio },
        selected: false,
        createdAt: new Date().toISOString(),
      };
      addMedia(scene, record);
      generated += 1;
      console.log(`     ✅ ${record.file}  [${id}]`);
    }
    console.log("");
  }

  if (dryRun) {
    console.log("✨ Dry run complete — no images generated.");
    return;
  }

  console.log(`✨ Generated ${generated} reference candidate(s) (${existing} existed before).`);
  console.log(`   Review them in ${referencesDir(slug)}`);
  console.log(`   Then: pnpm scene:select ${slug}   # list + pick keepers`);
}

main().catch((err) => {
  console.error("❌ Reference generation failed:", err);
  process.exit(1);
});
