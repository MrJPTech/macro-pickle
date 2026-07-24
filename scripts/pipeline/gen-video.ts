import "./load-env";
import { basename, join } from "node:path";
import {
  loadScene,
  saveScene,
  addMedia,
  videoDir,
  makeId,
  selectedReferences,
  readMediaBuffer,
  mediaName,
} from "../lib/pipeline/scene-store";
import { generateVideo, type VeoFrame, type VeoKey } from "../lib/veo";
import { estimateOmniCost, generateOmniVideo } from "../lib/omni";
import { groundFrames } from "../lib/vision";
import { PromptEnhancer } from "../lib/pipeline/prompt-enhancer";
import type { MediaRecord } from "../lib/pipeline/types";

/**
 * Stage 2 — generate video from the curated reference frames.
 *
 *   pnpm scene:video <slug> [--no-enhance] [--re-enhance] [--no-vision]
 *
 * Flow: selected frames → (vision grounding) → enhanced video prompt → Veo
 * (ingredients / first+last frame / first frame) → local .mp4.
 * Enhanced prompts are cached on the manifest and reused (--re-enhance refreshes).
 */

// scene.json uses descriptive video-model names; map to the toolkit's Veo tiers.
const VEO_KEY: Record<string, VeoKey> = {
  "veo-3.1": "quality",
  "veo-3.1-fast": "fast",
  "veo-3.1-lite": "lite",
  "veo-3": "veo3",
  "veo-3-fast": "veo3-fast",
  "veo-2": "veo2",
};

function flag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const slug = process.argv[2];
  if (!slug || slug.startsWith("--")) {
    console.error("Usage: pnpm scene:video <slug> [--no-enhance] [--no-vision]");
    process.exit(1);
  }

  const scene = loadScene(slug);
  const selected = selectedReferences(scene);

  if (selected.length === 0) {
    console.error(
      `❌ No selected reference frames. Run: pnpm scene:select ${slug} <id> ...`
    );
    process.exit(1);
  }

  const mode = scene.video.useSelectedAs;
  const doEnhance = scene.video.enhance && !flag("--no-enhance");
  const doVision = (scene.video.groundWithVision ?? false) && !flag("--no-vision");
  // "omni-flash" routes to Gemini Omni Flash (conversational gen/edit, PAID
  // tier only, ~$0.10/s output); everything else maps to a Veo tier.
  const useOmni = scene.video.model === "omni-flash";
  let model: VeoKey = VEO_KEY[scene.video.model] ?? "fast";

  console.log(`🎬 Stage 2 — video for "${scene.title}" (${slug})`);
  if (useOmni) {
    const est = estimateOmniCost({ outputSeconds: 8, imageCount: selected.length });
    console.log(`   model: omni-flash (Gemini Omni Flash — PAID, ~$${est.usd.toFixed(2)}/clip) · aspect: ${scene.video.aspectRatio} · mode: ${mode}`);
  } else {
    console.log(`   model: ${scene.video.model} → ${model} · aspect: ${scene.video.aspectRatio} · mode: ${mode}`);
  }
  console.log(`   selected frames: ${selected.map(mediaName).join(", ")}`);
  console.log(`   enhance: ${doEnhance ? "on" : "off"} · vision grounding: ${doVision ? "on" : "off"}\n`);

  // Load selected frames as buffers (order preserved for firstLast).
  const frames: VeoFrame[] = selected.map((m) => ({
    buffer: readMediaBuffer(slug, m),
    mimeType: m.mimeType,
  }));

  // Map the scene's mode onto Veo inputs.
  let image: VeoFrame | undefined;
  let lastFrame: VeoFrame | undefined;
  let refs: VeoFrame[] | undefined;
  if (mode === "firstLast") {
    image = frames[0];
    lastFrame = frames[1];
  } else if (mode === "firstFrame") {
    image = frames[0];
  } else {
    // "ingredients" — up to 3 ASSET reference images, no first frame.
    refs = frames.slice(0, 3);
  }

  // Image → understanding → prompt feedback loop.
  let visualContext: string | undefined;
  if (doVision) {
    console.log("  🔍 Analyzing selected frames with Gemini vision...");
    const analysis = await groundFrames(frames);
    visualContext = analysis.groundingSummary;
    console.log(`     subjects: ${analysis.subjects.join(", ") || "—"}`);
    if (analysis.detectedText.length)
      console.log(`     on-image text: ${analysis.detectedText.join(" | ")}`);
    console.log(`     grounding: ${visualContext}\n`);

    // Veo 3.1 preview safety-filters image-to-video when the SEED contains a real
    // face (see veo.ts) — those renders come back "possibly safety-blocked". When
    // vision sees a person in a first-frame seed, route to Veo 3.0 instead.
    const personish = /\b(face|person|people|man|woman|boy|girl|human|portrait|selfie)\b/i;
    const seenSubjects = `${analysis.caption} ${analysis.subjects.join(" ")}`;
    if (!useOmni && image && ["quality", "fast", "lite"].includes(model) && personish.test(seenSubjects)) {
      console.log(
        `  ⚠️  Person detected in the seed frame — Veo 3.1 blocks face-seeded image-to-video.\n` +
          `     Switching ${model} → veo3 for this render (set scene.video.model to "veo-3" to silence).\n`
      );
      model = "veo3";
    }
  }

  const enhancer = doEnhance ? new PromptEnhancer() : null;
  let generated = 0;

  for (const prompt of scene.video.prompts) {
    let finalPrompt = prompt.text;

    if (enhancer && prompt.enhanced && !flag("--re-enhance")) {
      // Reuse the cached enhancement — no repeat Gemini call, deterministic re-runs.
      finalPrompt = prompt.enhanced;
      console.log(`  ♻️  Cached enhanced prompt [${prompt.id}] (--re-enhance to refresh):\n     ${finalPrompt}\n`);
    } else if (enhancer) {
      const result = await enhancer.enhanceVideoPrompt(prompt.text, {
        hasReferences: true,
        aspectRatio: scene.video.aspectRatio,
        negativePrompt: scene.video.negativePrompt || undefined,
        visualContext,
      });
      finalPrompt = result.prompt;
      prompt.enhanced = result.prompt;
      saveScene(scene); // persist immediately so a crash mid-batch doesn't lose the rewrite
      console.log(`  ✏️  Enhanced [${prompt.id}]:\n     ${finalPrompt}\n`);
    }

    console.log(`  🎥 Generating video for [${prompt.id}] (this can take a few minutes)...`);
    const id = makeId("vid");
    let resultFile: string;
    let resultModel: string;
    if (useOmni) {
      // Omni Flash takes every frame mode as reference-image content blocks;
      // negative prompts / resolution / audio toggles are unsupported.
      const omniImages = image ? [image, ...(lastFrame ? [lastFrame] : [])] : (refs ?? []);
      const r = await generateOmniVideo({
        prompt: finalPrompt,
        images: omniImages.map((f) => ({ buffer: f.buffer, mimeType: f.mimeType })),
        aspect: scene.video.aspectRatio === "9:16" ? "9:16" : "16:9",
        outDir: videoDir(slug),
        name: id,
        onStatus: (m) => console.log(`     … ${m}`),
      });
      resultFile = r.file;
      resultModel = "omni-flash";
      console.log(`     interaction id: ${r.interactionId} (edit it: pnpm omni --continue ${r.interactionId} --prompt "…")`);
    } else {
      const result = await generateVideo({
        prompt: finalPrompt,
        image,
        lastFrame,
        refs,
        aspect: scene.video.aspectRatio,
        resolution: scene.video.resolution,
        negative: scene.video.negativePrompt || undefined,
        generateAudio: scene.video.generateAudio,
        model,
        outDir: videoDir(slug),
        name: id,
        onTick: (s) => process.stdout.write(`\r     ...rendering (${Math.round(s)}s)   `),
      });
      process.stdout.write("\n");
      resultFile = result.file;
      resultModel = result.model;
    }

    const fileRel = join("video", basename(resultFile)).replace(/\\/g, "/");

    const record: MediaRecord = {
      id,
      stage: "video",
      promptId: prompt.id,
      file: fileRel,
      mimeType: "video/mp4",
      model: resultModel,
      rawPrompt: prompt.text,
      finalPrompt,
      params: {
        mode,
        aspectRatio: scene.video.aspectRatio,
        resolution: scene.video.resolution,
        sourceFrames: selected.map((m) => m.id),
        visualContext: visualContext ?? null,
      },
      selected: false,
      createdAt: new Date().toISOString(),
    };
    addMedia(scene, record);
    generated += 1;
    console.log(`     ✅ ${record.file}  [${id}]\n`);
  }

  // Persist any enhanced-prompt updates written onto the prompts.
  saveScene(scene);
  console.log(`✨ Generated ${generated} video clip(s) in ${videoDir(slug)}`);
}

main().catch((err) => {
  console.error("❌ Video generation failed:", err);
  process.exit(1);
});
