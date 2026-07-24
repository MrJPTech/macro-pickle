/**
 * mcp/image-server/index.ts
 *
 * Desktop MCP server exposing macro-pickle's Supabase-free image generator as a
 * tool. Claude Desktop launches this over stdio; calling `generate_image` runs
 * Imagen 4.0 and writes the PNG to the local export folder (point
 * MACRO_PICKLE_EXPORT_DIR at a synced folder so results reach your phone).
 *
 * Env (set in claude_desktop_config.json -> mcpServers.<name>.env):
 *   GOOGLE_API_KEY            (required)
 *   MACRO_PICKLE_EXPORT_DIR   (output dir; defaults to ./generated-images)
 *
 * Run standalone for a smoke test:  pnpm mcp:image
 */

import { config as loadEnv } from "dotenv";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { generateImage } from "../../scripts/lib/imagen.js";
import { generateVideo, VEO_MODELS, type VeoKey } from "../../scripts/lib/veo.js";
import { generateKlingVideo, estimateKlingCost, KLING_MODELS, type KlingKey } from "../../scripts/lib/kling.js";
import { buildImagePrompt } from "../../scripts/lib/prompts/image.js";
import { buildVideoPrompt } from "../../scripts/lib/prompts/video.js";
import { lintScene } from "../../scripts/lib/prompts/scene.js";
import { listBrandProfiles } from "../../scripts/lib/prompts/brand.js";
import { exportPromptToVault } from "../../scripts/lib/prompts/export.js";
import {
  ugcBriefSet,
  listUGCFormats,
  type UGCFormatKey,
} from "../../scripts/lib/prompts/ugc.js";
import { describeProduct, describeReferenceVideo } from "../../scripts/lib/vision.js";
import type {
  ImageBrief,
  VideoBrief,
  Scene,
} from "../../scripts/lib/prompts/types.js";

// Claude Desktop passes env via the config "env" block (primary). These calls
// are a fallback for local `pnpm mcp:image` testing; dotenv never overrides
// already-set vars, so the Desktop-provided env always wins.
loadEnv({ path: ".env.local" });
loadEnv();

const server = new Server(
  { name: "macro-pickle-images", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description:
        "Generate reference image(s) with Imagen 4.0 and save them to the local " +
        "export folder (MACRO_PICKLE_EXPORT_DIR, typically a synced folder that " +
        "syncs to phone). No database involved.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The image description / prompt.",
          },
          count: {
            type: "number",
            description: "Number of images to generate (1-4). Default 1.",
          },
          aspect: {
            type: "string",
            description: 'Aspect ratio: "16:9", "1:1", "9:16", "4:3", "3:4". Default "16:9".',
          },
          name: {
            type: "string",
            description: "Optional label used in the output filename slug.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "build_image_prompt",
      description:
        "Engineer a Nano Banana Pro / Imagen image prompt from a structured " +
        "brief using the 'Perfect Prompt' formula (Subject + Action + Context + " +
        "Composition + Lighting + Style). Applies a brand profile if given and a " +
        "negative clause. Returns the prompt text + aspect — feed it to generate_image. " +
        `Brands: ${listBrandProfiles().join(", ") || "none"}.`,
      inputSchema: {
        type: "object",
        properties: {
          subject: { type: "string", description: "Main subject (required)." },
          action: { type: "string", description: "What the subject is doing." },
          context: { type: "string", description: "Environment / setting." },
          composition: { type: "string", description: "Shot size, lens, framing." },
          lighting: { type: "string", description: "Lighting description." },
          style: { type: "string", description: "Art/visual style (overrides brand style)." },
          text: { type: "string", description: "Exact text to render on the image." },
          aspect: { type: "string", description: 'e.g. "16:9", "1:1", "9:16".' },
          quality: {
            type: "string",
            description: "photoreal | illustration | cinematic.",
          },
          negative: {
            type: "string",
            description: "Negative preset (image|video|product) or a custom string.",
          },
          brand: { type: "string", description: "Brand profile name to apply." },
          refs: {
            type: "array",
            items: { type: "string" },
            description: '@-reference handles, e.g. ["@Image1 as the character"].',
          },
          save: {
            type: "boolean",
            description:
              "Save the exported prompt to your prompt vault (Obsidian-flavored markdown).",
          },
          title: { type: "string", description: "Note title when save=true." },
        },
        required: ["subject"],
      },
    },
    {
      name: "build_video_prompt",
      description:
        "Engineer a Veo 3.1 / Flow 'Director Brief' from a structured brief " +
        "(Scene · Subject · Camera · Action · Audio · Pacing/Style). Optional " +
        "intent preset (epic|intimate|product|energetic|noir) seeds camera + " +
        "lighting. Returns the labeled brief text to paste into Flow/Veo.",
      inputSchema: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Environment + lighting (required)." },
          subject: { type: "string", description: "Identity + detail (required)." },
          camera: {
            type: "object",
            description: "{ move, lens, size, speed }",
            properties: {
              move: { type: "string" },
              lens: { type: "string" },
              size: { type: "string" },
              speed: { type: "string" },
            },
          },
          beats: {
            type: "array",
            description: "Time-segmented action beats.",
            items: {
              type: "object",
              properties: {
                time: { type: "string", description: 'e.g. "0.0-3.0s".' },
                action: { type: "string" },
              },
              required: ["time", "action"],
            },
          },
          audio: { type: "string", description: "Music + SFX + ambience." },
          pacing: { type: "string", description: "Timing + mood + grade." },
          durationSec: { type: "number" },
          aspect: { type: "string" },
          consistency: {
            type: "boolean",
            description: "Append the verbatim character-consistency clause.",
          },
          negative: { type: "string", description: "Negative preset or custom string." },
          brand: { type: "string", description: "Brand profile name to apply." },
          refs: { type: "array", items: { type: "string" } },
          intent: {
            type: "string",
            description: "epic | intimate | product | energetic | noir.",
          },
          format: {
            type: "string",
            description:
              "UGC short-form selling format label (faceless-finds, unboxing, " +
              "problem-solution, demo, before-after, listicle, tutorial). Rendered as a FORMAT line.",
          },
          captions: {
            type: "array",
            items: { type: "string" },
            description:
              "On-screen caption cards (edit/post overlay, NOT rendered by the model).",
          },
          save: {
            type: "boolean",
            description:
              "Save the exported prompt to your prompt vault (Obsidian-flavored markdown).",
          },
          title: { type: "string", description: "Note title when save=true." },
        },
        required: ["scene", "subject"],
      },
    },
    {
      name: "describe_product",
      description:
        "Look at a product PHOTO with Gemini vision and return structured JSON: the " +
        "OCR'd text/watermark/sticker/logo to STRIP for a clean recreation, the product " +
        "type, materials, and a recommended real-world IN-USE scene to stage it in. The " +
        "front door of the product -> reference-photo -> UGC pipeline. Requires GOOGLE_API_KEY. " +
        "Set paddleOcr:true to also run the local PaddleOCR sidecar for high-recall small/CJK " +
        "text + geometry (separate ocr_* fields; needs Python+paddleocr, non-fatal if absent).",
      inputSchema: {
        type: "object",
        properties: {
          imagePath: { type: "string", description: "Absolute path to the product photo." },
          title: { type: "string", description: "Known product title (optional)." },
          description: { type: "string", description: "Known product description (optional)." },
          brand: {
            type: "string",
            description: 'Brand framing for the scene, e.g. "Quiet Desk Co. (premium desk objects)".',
          },
          paddleOcr: {
            type: "boolean",
            description:
              "Opt-in: also run the local PaddleOCR sidecar to sharpen OCR (high-recall " +
              "small/CJK text + per-line geometry, returned in ocr_* fields). Requires a " +
              "Python with paddleocr installed (MACRO_PICKLE_PYTHON). Non-fatal if absent.",
          },
          paddleLang: {
            type: "string",
            description: 'PaddleOCR lang id when paddleOcr is on. Default "ch" (Chinese + English).',
          },
        },
        required: ["imagePath"],
      },
    },
    {
      name: "build_ugc_spot",
      description:
        "Build a FACELESS short-form UGC selling package for ONE product: a 9:16 " +
        "Director Brief (hook -> demo -> CTA with a post caption track), plus a clean " +
        "studio HERO still brief and a faceless lifestyle STILL brief. Faceless by default " +
        "(no face in frame -> no identity-lock, no IP cost). Formats: " +
        `${listUGCFormats().map((f) => f.key).join(", ")}.`,
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "kebab id used in filenames." },
          name: { type: "string", description: "Plain product name (never a trademark)." },
          benefit: {
            type: "string",
            description: "One-line benefit copy — drives the hook + captions.",
          },
          scene: {
            type: "string",
            description: "Real-world in-use scene (use describe_product's suggested_scene).",
          },
          format: {
            type: "string",
            description: `Selling format: ${listUGCFormats().map((f) => f.key).join(" | ")}. Default faceless-finds.`,
          },
          brand: { type: "string", description: "Brand profile to apply (optional)." },
          cta: { type: "string", description: "Optional CTA card override." },
          save: {
            type: "boolean",
            description: "Save all three prompts to your prompt vault.",
          },
        },
        required: ["id", "name", "benefit", "scene"],
      },
    },
    {
      name: "analyze_reference_video",
      description:
        "Watch a SHORT reference/competitor UGC clip with Gemini and reverse-engineer its " +
        "selling structure (hook, format, pacing, shot list, captions, CTA) so it can be " +
        "MIRRORED into a brief — same form, your product. Short clips only (~18MB inline cap; " +
        "trim first or use opus-clip-automation for long-form). Requires GOOGLE_API_KEY.",
      inputSchema: {
        type: "object",
        properties: {
          videoPath: { type: "string", description: "Absolute path to the reference clip." },
          goal: {
            type: "string",
            description: 'Optional steer, e.g. "adapt for a collapsible water bucket".',
          },
        },
        required: ["videoPath"],
      },
    },
    {
      name: "generate_video",
      description:
        "Generate a video clip and save it to the local export folder. " +
        "Dispatches to Veo (backend=veo, default) or Kling via fal.ai (backend=kling). " +
        "Veo models: quality, fast, lite, veo3, veo3-fast, veo2. " +
        "Kling models: i2v-pro (image-to-video, 2.6 Pro), t2v-master (text-to-video 2.1), i2v-4k (4K). " +
        "For i2v pass image_path (local file). Kling i2v aspect is inferred from the seed image. " +
        "Kling is PAID (real money per second) — a kling call without allow_paid:true returns the " +
        "cost estimate instead of generating.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Video prompt / Director Brief text." },
          backend: {
            type: "string",
            description: '"veo" (Google, default) or "kling" (fal.ai).',
          },
          model: {
            type: "string",
            description:
              "Veo: quality | fast | lite | veo3 | veo3-fast | veo2. " +
              "Kling: i2v-pro | t2v-master | i2v-4k. Defaults to backend default.",
          },
          image_path: {
            type: "string",
            description: "Absolute path to seed image for image-to-video generation.",
          },
          duration: {
            type: "string",
            description: 'Kling only: "5" or "10" seconds. Default "5".',
          },
          aspect: {
            type: "string",
            description: 'Aspect ratio: "16:9", "9:16", "1:1". Ignored by Kling i2v (inferred from image).',
          },
          name: { type: "string", description: "Slug used in the output filename." },
          allow_paid: {
            type: "boolean",
            description:
              "Required true for backend=kling — Kling bills real money per second of output. " +
              "Without it the tool returns the estimated cost and does NOT generate.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "lint_scene",
      description:
        "Run the continuity & IP-safety linter on a storyboard scene: flags " +
        "copyrighted names (need proxies), overloaded beats, missing atmospherics, " +
        "movement without a stationary-cycle callout, and unfixed camera language.",
      inputSchema: {
        type: "object",
        properties: {
          number: { type: "number" },
          title: { type: "string" },
          summary: { type: "string" },
          setting: { type: "string", description: 'e.g. "EXT. STREET - NIGHT".' },
          subject: { type: "string" },
          beats: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: { type: "string" },
                action: { type: "string" },
              },
              required: ["time", "action"],
            },
          },
          atmospherics: { type: "string" },
          style: { type: "string" },
        },
        required: ["number", "title", "summary", "setting", "subject", "beats", "style"],
      },
    },
  ],
}));

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  // --- Prompt-engineering tools (no API call, no generation) ---------------
  if (req.params.name === "build_image_prompt") {
    if (typeof args.subject !== "string" || !args.subject) {
      return fail("Missing required argument: subject");
    }
    try {
      const built = buildImagePrompt(args as unknown as ImageBrief);
      let text = `${built.prompt}\n\n(aspect ${built.aspect})`;
      if (args.save) {
        const file = exportPromptToVault({
          kind: "image",
          title: String(args.title ?? args.subject),
          prompt: built.prompt,
          brand: typeof args.brand === "string" ? args.brand : undefined,
          aspect: built.aspect,
          brief: args,
        });
        text += `\n\n📓 Saved to vault: ${file}`;
      }
      return ok(text);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  if (req.params.name === "build_video_prompt") {
    if (typeof args.scene !== "string" || typeof args.subject !== "string") {
      return fail("Missing required arguments: scene, subject");
    }
    try {
      const prompt = buildVideoPrompt(args as unknown as VideoBrief);
      let text = prompt;
      if (args.save) {
        const file = exportPromptToVault({
          kind: "video",
          title: String(args.title ?? args.subject),
          prompt,
          brand: typeof args.brand === "string" ? args.brand : undefined,
          aspect: typeof args.aspect === "string" ? args.aspect : undefined,
          brief: args,
        });
        text += `\n\n📓 Saved to vault: ${file}`;
      }
      return ok(text);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  // --- Product vision -> UGC ------------------------------------------------
  if (req.params.name === "describe_product") {
    if (typeof args.imagePath !== "string" || !args.imagePath) {
      return fail("Missing required argument: imagePath");
    }
    try {
      const desc = await describeProduct({
        imagePath: args.imagePath,
        title: typeof args.title === "string" ? args.title : undefined,
        description: typeof args.description === "string" ? args.description : undefined,
        brand: typeof args.brand === "string" ? args.brand : undefined,
        paddleOcr: args.paddleOcr === true,
        paddleLang: typeof args.paddleLang === "string" ? args.paddleLang : undefined,
      });
      return ok(JSON.stringify(desc, null, 2));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  if (req.params.name === "build_ugc_spot") {
    for (const k of ["id", "name", "benefit", "scene"] as const) {
      if (typeof args[k] !== "string" || !args[k]) {
        return fail(`Missing required argument: ${k}`);
      }
    }
    try {
      const product = {
        id: String(args.id),
        name: String(args.name),
        benefit: String(args.benefit),
        scene: String(args.scene),
        cta: typeof args.cta === "string" ? args.cta : undefined,
      };
      const brand = typeof args.brand === "string" ? args.brand : undefined;
      const fmt = (typeof args.format === "string" ? args.format : "faceless-finds") as UGCFormatKey;
      const set = ugcBriefSet(product, fmt, brand);
      const hero = buildImagePrompt(set.hero);
      const still = buildImagePrompt(set.still);
      const spot = buildVideoPrompt(set.spot);
      let text =
        `=== CLEAN HERO STILL (${hero.aspect}) ===\n${hero.prompt}\n\n` +
        `=== FACELESS LIFESTYLE STILL (${still.aspect}) ===\n${still.prompt}\n\n` +
        `=== 9:16 UGC SPOT (${fmt}) ===\n${spot}`;
      if (args.save) {
        exportPromptToVault({ kind: "image", title: `${product.name} — UGC hero still`, prompt: hero.prompt, brand, aspect: hero.aspect, brief: set.hero });
        exportPromptToVault({ kind: "image", title: `${product.name} — UGC lifestyle still`, prompt: still.prompt, brand, aspect: still.aspect, brief: set.still });
        const f = exportPromptToVault({ kind: "video", title: `${product.name} — UGC ${fmt} spot`, prompt: spot, brand, aspect: "9:16", tool: "Veo 3.1 / Google Flow", brief: set.spot });
        text += `\n\n📓 Saved 3 notes to vault (spot: ${f})`;
      }
      return ok(text);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  if (req.params.name === "analyze_reference_video") {
    if (typeof args.videoPath !== "string" || !args.videoPath) {
      return fail("Missing required argument: videoPath");
    }
    try {
      const a = await describeReferenceVideo({
        videoPath: args.videoPath,
        goal: typeof args.goal === "string" ? args.goal : undefined,
      });
      return ok(JSON.stringify(a, null, 2));
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  if (req.params.name === "lint_scene") {
    try {
      const issues = lintScene(args as unknown as Scene);
      if (issues.length === 0) return ok("✅ No issues — scene passes the linter.");
      const list = issues
        .map((i) => `${i.severity === "error" ? "❌" : "⚠️"} [${i.rule}] ${i.message}`)
        .join("\n");
      return ok(`${issues.length} issue(s):\n${list}`);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  // --- Video generation (Veo + Kling) --------------------------------------
  if (req.params.name === "generate_video") {
    if (typeof args.prompt !== "string" || !args.prompt) {
      return fail("Missing required argument: prompt");
    }
    const backend = typeof args.backend === "string" ? args.backend : "veo";
    const outDir = process.env.MACRO_PICKLE_EXPORT_DIR
      ? `${process.env.MACRO_PICKLE_EXPORT_DIR}/${backend}-clips`
      : `${backend}-clips`;
    const name = typeof args.name === "string" ? args.name : undefined;
    const imagePath = typeof args.image_path === "string" ? args.image_path : undefined;
    const aspect = typeof args.aspect === "string" ? args.aspect : "16:9";

    try {
      if (backend === "kling") {
        const model = (typeof args.model === "string" ? args.model : undefined) as KlingKey | undefined;
        if (model && !KLING_MODELS[model]) return fail(`Unknown Kling model: ${model}. Valid: ${Object.keys(KLING_MODELS).join(", ")}`);
        const duration = (typeof args.duration === "string" ? args.duration : "5") as "5" | "10";
        const effectiveModel: KlingKey = model ?? (imagePath ? "i2v-pro" : "t2v-master");
        const estCost = estimateKlingCost(effectiveModel, Number(duration));
        // Paid-path gate: never spend real money on a blind tool call.
        if (args.allow_paid !== true) {
          return ok(
            `💰 Kling is PAID: ${effectiveModel} × ${duration}s ≈ $${estCost.toFixed(2)} (fal.ai, real spend).\n` +
              `No video was generated. Re-call with allow_paid: true to proceed.`
          );
        }
        const r = await generateKlingVideo({
          prompt: args.prompt as string,
          imagePath,
          duration,
          aspect: aspect as "16:9" | "9:16" | "1:1",
          outDir,
          name,
          model,
        });
        const mb = (r.bytes / 1024 / 1024).toFixed(1);
        return ok(`🎬 Kling video saved: ${r.file}\n${mb} MB · ${Math.round(r.seconds)}s render · model: ${r.model} · ~$${r.estimatedCostUsd.toFixed(2)} spent`);
      } else {
        const model = (typeof args.model === "string" ? args.model : "fast") as VeoKey;
        if (!VEO_MODELS[model]) return fail(`Unknown Veo model: ${model}. Valid: ${Object.keys(VEO_MODELS).join(", ")}`);
        const r = await generateVideo({
          prompt: args.prompt as string,
          imagePath,
          outDir,
          name,
          model,
          aspect,
        });
        const mb = (r.bytes / 1024 / 1024).toFixed(1);
        return ok(`🎬 Veo video saved: ${r.file}\n${mb} MB · ${Math.round(r.seconds)}s render · model: ${r.model}`);
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  }

  // --- Image generation ----------------------------------------------------
  if (req.params.name !== "generate_image") {
    return fail(`Unknown tool: ${req.params.name}`);
  }

  const a = args as {
    prompt?: string;
    count?: number;
    aspect?: string;
    name?: string;
  };

  if (!a.prompt || typeof a.prompt !== "string") {
    return fail("Missing required argument: prompt");
  }

  const outDir = process.env.MACRO_PICKLE_EXPORT_DIR || "generated-images";

  try {
    const files = await generateImage({
      prompt: a.prompt,
      count: a.count ? Math.min(4, Math.max(1, a.count)) : 1,
      aspect: a.aspect,
      name: a.name,
      outDir,
    });

    const list = files
      .map((f) => `- ${f.filename} (${(f.bytes / 1024).toFixed(0)} KB)`)
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Saved ${files.length} image(s) to ${outDir}:\n${list}`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Logs must go to stderr — stdout is the MCP protocol channel.
  console.error("macro-pickle-images MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
