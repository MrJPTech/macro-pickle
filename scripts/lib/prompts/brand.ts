/**
 * scripts/lib/prompts/brand.ts
 *
 * Loads brand/style profiles from content/brands/<name>.json. DB-free — these
 * are plain JSON so they sync, diff, and version with the repo. Override the
 * directory with MACRO_PICKLE_BRANDS_DIR.
 */

import fs from "fs";
import path from "path";
import type { BrandProfile } from "./types.js";

const BRANDS_DIR = process.env.MACRO_PICKLE_BRANDS_DIR || "content/brands";

export function loadBrandProfile(name: string): BrandProfile {
  const file = path.join(BRANDS_DIR, `${name.toLowerCase()}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(
      `Brand profile not found: ${file} (available: ${listBrandProfiles().join(", ") || "none"})`
    );
  }
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as BrandProfile;
  if (!parsed.name || !parsed.style) {
    throw new Error(
      `Brand profile "${name}" is missing required fields (name, style)`
    );
  }
  return parsed;
}

export function listBrandProfiles(): string[] {
  if (!fs.existsSync(BRANDS_DIR)) return [];
  return fs
    .readdirSync(BRANDS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}
