/**
 * scripts/analyze-video.ts  —  `pnpm analyze-video`
 *
 * Reference-video understanding: watch a short competitor/example UGC clip with Gemini
 * and reverse-engineer its SELLING structure (hook, format, pacing, shot list, captions,
 * CTA) so it can be MIRRORED — same form, our product — into a UGC brief (ugc.ts).
 * Short clips only (inline ~18MB cap; trim first, or use opus-clip-automation for
 * long-form). ZERO Supabase. Requires GOOGLE_API_KEY in .env.local.
 *
 *   pnpm analyze-video --video ./ref.mp4
 *   pnpm analyze-video --video ./ref.mp4 --goal "adapt for a collapsible water bucket"
 *   pnpm analyze-video --video ./ref.mp4 --save
 */

import { config as loadEnv } from "dotenv";
import { describeReferenceVideo } from "./lib/vision.js";
import { exportPromptToVault } from "./lib/prompts/export.js";

loadEnv({ path: ".env.local" });
loadEnv();

function arg(...flags: string[]): string | undefined {
  for (const flag of flags) {
    const i = process.argv.indexOf(flag);
    if (i >= 0) return process.argv[i + 1];
  }
  return undefined;
}

async function main() {
  const videoPath = arg("--video", "-v");
  if (!videoPath) {
    console.error("❌ Usage: pnpm analyze-video --video <path> [--goal <text>] [--save]");
    process.exit(1);
  }
  if (!process.env.GOOGLE_API_KEY) {
    console.error("❌ analyze-video requires GOOGLE_API_KEY in .env.local");
    process.exit(1);
  }

  try {
    const a = await describeReferenceVideo({ videoPath, goal: arg("--goal") });
    console.log(JSON.stringify(a, null, 2));

    if (process.argv.includes("--save")) {
      const body = [
        `**Format:** ${a.format}`,
        `**Hook (0-3s):** ${a.hook}`,
        `**Pacing:** ${a.pacing}`,
        `**On-screen text:** ${a.on_screen_text}`,
        `**CTA:** ${a.cta}`,
        `**Audio:** ${a.audio}`,
        ``,
        `**Shot list:**`,
        ...a.shot_list.map((s, i) => `${i + 1}. ${s}`),
        ``,
        `**Mirror idea:** ${a.mirror_brief_idea}`,
      ].join("\n");
      const file = exportPromptToVault({
        kind: "video",
        title: "reference-video analysis",
        prompt: body,
        tool: "Gemini vision (describeReferenceVideo)",
        brief: a,
      });
      console.log(`\n📓 Saved to vault: ${file}`);
    }
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}

main();
