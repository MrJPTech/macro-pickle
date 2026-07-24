/**
 * scripts/lib/imagen.ts
 *
 * Shared, Supabase-free image generation core. Used by both the CLI
 * (generate-image-local.ts) and the desktop MCP server (mcp/image-server).
 * Prompt(s) → Imagen 4.0 → PNG files on disk.
 */

import fs from "fs";
import path from "path";
import { SafetyFilterLevel, PersonGeneration } from "@google/genai";
import { getGoogleClient } from "./google.js";

export const IMAGEN_MODEL = "imagen-4.0-generate-001";

/** Image mime from a file extension — shared by every rail that inlines reference images. */
export function mimeForImage(file: string): string {
  const e = path.extname(file).toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".heic" || e === ".heif") return "image/heic";
  return "image/jpeg";
}

export interface GenerateOptions {
  prompt: string;
  /** Directory to write PNGs into (created if missing). */
  outDir: string;
  /** Images to generate for this prompt. Default 1. */
  count?: number;
  /** Imagen aspect ratio, e.g. "16:9", "1:1", "9:16". Default "16:9". */
  aspect?: string;
  /** Friendly name used in the filename slug. Falls back to the prompt. */
  name?: string;
  /** Overrides GOOGLE_API_KEY env var. */
  apiKey?: string;
}

export interface GeneratedFile {
  filename: string;
  fullPath: string;
  bytes: number;
}

/** Aspect ratios the Imagen 4.0 API accepts. Anything else 400s. */
export const IMAGEN_ASPECT_RATIOS = ["1:1", "9:16", "16:9", "4:3", "3:4"] as const;

/**
 * Coerce an arbitrary "w:h" aspect ratio to the nearest Imagen-supported one.
 * Brand profiles use social ratios (e.g. 4:5) that the API rejects; rather than
 * 400, snap to the closest supported ratio and warn. Returns supported inputs
 * unchanged; falls back to "16:9" for anything unparseable.
 */
export function coerceImagenAspect(aspect: string): string {
  if ((IMAGEN_ASPECT_RATIOS as readonly string[]).includes(aspect)) return aspect;
  const parse = (r: string): number | null => {
    const [w, h] = r.split(":").map(Number);
    return w && h && w > 0 && h > 0 ? w / h : null;
  };
  const target = parse(aspect);
  if (target === null) {
    console.warn(`⚠️  Unparseable aspect "${aspect}" → falling back to 16:9`);
    return "16:9";
  }
  let best: string = IMAGEN_ASPECT_RATIOS[0];
  let bestDelta = Infinity;
  for (const r of IMAGEN_ASPECT_RATIOS) {
    const delta = Math.abs(parse(r)! - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  console.warn(`⚠️  Aspect "${aspect}" not in supported set → using nearest "${best}"`);
  return best;
}

export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "image"
  );
}

export function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Generate one prompt's image(s) and write them to disk.
 * Throws on missing API key. Returns the files written.
 */
export async function generateImage(
  opts: GenerateOptions
): Promise<GeneratedFile[]> {
  const genai = getGoogleClient(opts.apiKey);

  const count = Math.max(1, opts.count ?? 1);
  const aspect = coerceImagenAspect(opts.aspect ?? "16:9");
  fs.mkdirSync(opts.outDir, { recursive: true });

  const response = await genai.models.generateImages({
    model: IMAGEN_MODEL,
    prompt: opts.prompt,
    config: {
      numberOfImages: count,
      aspectRatio: aspect,
      // Imagen API currently only accepts BLOCK_LOW_AND_ABOVE here.
      safetyFilterLevel: SafetyFilterLevel.BLOCK_LOW_AND_ABOVE,
      personGeneration: PersonGeneration.ALLOW_ADULT,
    },
  });

  const images = response.generatedImages ?? [];
  if (images.length === 0) {
    throw new Error("No image returned (prompt may have been blocked)");
  }

  const base = slugify(opts.name ?? opts.prompt);
  const stamp = timestamp();
  const written: GeneratedFile[] = [];

  images.forEach((img, idx) => {
    const data = img.image?.imageBytes;
    if (!data) return;
    const suffix = images.length > 1 ? `-${idx + 1}` : "";
    const filename = `${base}-${stamp}${suffix}.png`;
    const fullPath = path.join(opts.outDir, filename);
    const buffer = Buffer.from(data, "base64");
    fs.writeFileSync(fullPath, buffer);
    written.push({ filename, fullPath, bytes: buffer.length });
  });

  if (written.length === 0) {
    throw new Error("Image result contained no usable bytes");
  }

  return written;
}
