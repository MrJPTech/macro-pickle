/**
 * scripts/gen-clips.ts  —  `pnpm gen-clips`
 *
 * GENERIC batch reference→video clip generator for ANY store's gen5 reference sets.
 * Point it at a media dir laid out as <store>/<category>/<sku>/gen5/{studio_01..03,
 * life_01..02}.png and give it a scenes config; it emits two COMBOs per SKU:
 *
 *   COMBO A (Veo/Gemini) — 2 scene-variant clips via referenceType:"ASSET" lock
 *                          (studio_01..03 → product in a new environment). FREE on GOOGLE_API_KEY.
 *   COMBO B (Kling/fal.ai) — 1 studio→lifestyle reveal (studio_01 → life_01/02). PAID.
 *
 *   pnpm gen-clips --store <dir>                       # uses content/clip-scenes/<basename>.json (or generic)
 *   pnpm gen-clips --store <dir> --dry-run             # full plan, ZERO API calls — do this first
 *   pnpm gen-clips --store <dir> --veo-only            # free Veo scene variants only ($0)
 *   pnpm gen-clips --store <dir> --kling-only --yes    # paid Kling reveals only
 *   pnpm gen-clips --store <dir> --skus a,b,c          # only these SKU ids (pair with `rank-skus --ids`)
 *   pnpm gen-clips --store <dir> --limit 5             # first N SKUs
 *   pnpm gen-clips --store <dir> --scenes <path.json>  # explicit scenes config
 *   pnpm gen-clips --store <dir> --model quality       # Veo tier (quality|fast|lite|veo3|veo3-fast|veo2)
 *   pnpm gen-clips --store <dir> --out <name>          # export subdir name (default <store-basename>-clips)
 *   pnpm gen-clips --store <dir> --no-audio --yes      # Kling without native audio (half price)
 *   pnpm gen-clips --store <dir> --force               # regenerate clips that already exist
 *
 * Scenes config shape (content/clip-scenes/<store>.json):
 *   {
 *     "_suffix": "optional override of the product-lock/scale style suffix",
 *     "_scale":  { "<sku>": "a small palm-sized tin …" },   // per-SKU real-world scale anchor
 *     "_default": { "veo": ["scene A","scene B"], "kling": "reveal prompt" },
 *     "<category>": { "veo": ["scene A","scene B"], "kling": "reveal prompt" }
 *   }
 *
 * SPEND SAFETY (enforced, not advisory):
 *   - Kling runs abort unless --yes is passed (dry-run and --veo-only never need it).
 *   - Estimated Kling cost above the cap aborts BEFORE any paid call. Cap:
 *     --max-spend <usd>  >  MACRO_PICKLE_MAX_SPEND_USD  >  $25 default.
 *   - Clips whose output already exists are SKIPPED (resume-safe; --force overrides),
 *     so a re-run never re-pays for finished work.
 *   - A Veo daily-quota 429 aborts the remaining Veo clips (Kling continues);
 *     an exhausted fal.ai balance aborts the remaining Kling clips.
 */

import path from "path";
import fs from "fs";
import { config as loadEnv } from "dotenv";
import { generateVideo, VEO_MODELS, type VeoKey, type VeoFrame } from "./lib/veo.js";
import { generateKlingVideo, estimateKlingCost } from "./lib/kling.js";
import { slugify, mimeForImage } from "./lib/imagen.js";
import { QuotaExhaustedError } from "./lib/retry.js";

loadEnv({ path: ".env.local" });
loadEnv();

// Default product-lock + sales-polish + TRUE-SCALE suffix (overridable via config._suffix).
const DEFAULT_SUFFIX =
  ". Show ONLY the product exactly as in the reference images — do not add, duplicate, multiply, or invent any extra products or clutter. Keep the product the crisp, hero focal subject with true-to-reference colors, shape, and materials. Render it at realistic, true-to-life proportions and real-world size for what the item actually is — never oversized, giant, or out of scale with its surroundings; photorealistic with believable everyday scale. Premium commercial product advertisement: clean composition, sharp product detail, shallow depth of field, soft natural camera motion, warm inviting light, professional e-commerce campaign quality. No people, no text, no logos, no watermarks.";

const GENERIC_SCENE: [string, string] = [
  "Product hero in a natural outdoor environment, cinematic golden-hour light, no people",
  "Product displayed in a clean lifestyle setting, beautiful soft natural light, editorial quality, no people",
];
const GENERIC_KLING = "smooth studio-to-lifestyle reveal, product transforms from clean white background to its in-use scene, cinematic product focus";

const KLING_MODEL = "i2v-pro" as const;
const KLING_SECONDS = 5;

interface SceneEntry { veo: [string, string]; kling?: string }
interface ScenesConfig {
  _suffix?: string;
  _scale?: Record<string, string>;
  _default?: SceneEntry;
  [category: string]: SceneEntry | string | Record<string, string> | undefined;
}

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (flag: string) => process.argv.includes(flag);

function loadScenes(storeDir: string): ScenesConfig {
  const explicit = arg("--scenes");
  const byName = path.resolve("content/clip-scenes", `${path.basename(storeDir)}.json`);
  const file = explicit ?? (fs.existsSync(byName) ? byName : undefined);
  if (!file) {
    console.warn(`⚠  no scenes config (looked for ${byName}) — using GENERIC scenes for every category`);
    return {};
  }
  if (!fs.existsSync(file)) {
    console.error(`❌ scenes config not found: ${file}`);
    process.exit(1);
  }
  console.log(`   scenes: ${file}`);
  return JSON.parse(fs.readFileSync(file, "utf-8")) as ScenesConfig;
}

interface SKUSet {
  category: string; skuId: string; gen5Dir: string;
  studioRefs: string[]; startImage: string; endImage: string;
  scenes: [string, string]; klingPrompt: string;
}

function discoverSKUs(storeDir: string, cfg: ScenesConfig, filterIds?: string[]): SKUSet[] {
  const suffix = cfg._suffix ?? DEFAULT_SUFFIX;
  const scaleMap = cfg._scale ?? {};
  const results: SKUSet[] = [];
  const categories = fs.readdirSync(storeDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  for (const category of categories) {
    const catDir = path.join(storeDir, category);
    let skuDirs: string[];
    try { skuDirs = fs.readdirSync(catDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); }
    catch { continue; }

    for (const skuId of skuDirs) {
      const gen5Dir = path.join(catDir, skuId, "gen5");
      if (!fs.existsSync(gen5Dir)) continue;
      if (filterIds?.length && !filterIds.includes(skuId)) continue;

      const studio = [1, 2, 3].map((n) => path.join(gen5Dir, `studio_0${n}.png`));
      if (!studio.every((p) => fs.existsSync(p))) {
        console.warn(`⚠  ${category}/${skuId}/gen5 missing studio refs — skip`);
        continue;
      }
      const life1 = path.join(gen5Dir, "life_01.png");
      const life2 = path.join(gen5Dir, "life_02.png");
      const endImage = fs.existsSync(life1) ? life1 : fs.existsSync(life2) ? life2 : "";
      if (!endImage) console.warn(`⚠  ${category}/${skuId}/gen5 has no lifestyle frame — Kling skip`);

      const entry = (cfg[category] as SceneEntry | undefined) ?? cfg._default;
      const rawScenes: [string, string] = entry?.veo ?? GENERIC_SCENE;
      const scalePhrase = scaleMap[skuId] ? ` The product is ${scaleMap[skuId]}.` : "";
      const scenes: [string, string] = [rawScenes[0] + scalePhrase + suffix, rawScenes[1] + scalePhrase + suffix];

      results.push({
        category, skuId, gen5Dir,
        studioRefs: studio, startImage: studio[0]!, endImage,
        scenes,
        klingPrompt: entry?.kling ?? GENERIC_KLING,
      });
    }
  }
  return results;
}

/** True when a clip with this job name was already generated into outDir (resume support). */
function clipExists(outDir: string, jobName: string): boolean {
  if (!fs.existsSync(outDir)) return false;
  const prefix = `${slugify(jobName)}-`;
  return fs.readdirSync(outDir).some((f) => f.startsWith(prefix) && f.endsWith(".mp4"));
}

async function main() {
  const storeDir = arg("--store");
  if (!storeDir || !fs.existsSync(storeDir)) {
    console.error(`❌ pass --store <media-dir> (got: ${storeDir ?? "none"})`);
    console.error(`   layout: <store>/<category>/<sku>/gen5/{studio_01..03,life_01..02}.png`);
    process.exit(1);
  }

  const isDryRun = hasFlag("--dry-run");
  const veoOnly = hasFlag("--veo-only");
  const klingOnly = hasFlag("--kling-only");
  const force = hasFlag("--force");
  const audioOn = !hasFlag("--no-audio");
  const limit = arg("--limit") ? parseInt(arg("--limit")!, 10) : 0;
  const filterIds = arg("--skus")?.split(",").map((s) => s.trim()).filter(Boolean);
  const veoAspect = arg("--aspect") ?? "9:16";

  // Veo tier — validated, no silent fallback (a CSV or typo used to coerce to "fast").
  const modelArg = arg("--model") ?? arg("--models") ?? "fast";
  if (!(modelArg in VEO_MODELS)) {
    console.error(`❌ unknown Veo model "${modelArg}". Valid: ${Object.keys(VEO_MODELS).join(", ")}`);
    process.exit(1);
  }
  const veoModel = modelArg as VeoKey;

  const exportName = arg("--out") ?? `${path.basename(storeDir)}-clips`;
  const exportRoot = process.env.MACRO_PICKLE_EXPORT_DIR
    ? path.join(process.env.MACRO_PICKLE_EXPORT_DIR, exportName)
    : path.resolve(exportName);

  const cfg = loadScenes(storeDir);
  const skus = discoverSKUs(storeDir, cfg, filterIds);
  const batch = limit > 0 ? skus.slice(0, limit) : skus;

  // Build the plan with resume-awareness: existing clips are skipped (unless --force)
  // and never counted in the spend estimate.
  interface Plan {
    sku: SKUSet; outDir: string;
    veo: { index: number; scene: string; name: string; exists: boolean }[];
    kling?: { name: string; exists: boolean };
  }
  const plans: Plan[] = batch.map((s) => {
    const outDir = path.join(exportRoot, `${s.category}-${s.skuId}`);
    return {
      sku: s, outDir,
      veo: klingOnly ? [] : s.scenes.map((scene, i) => {
        const name = `${s.category}-${s.skuId}-scene${i + 1}`;
        return { index: i, scene, name, exists: !force && clipExists(outDir, name) };
      }),
      kling: veoOnly || !s.endImage ? undefined : (() => {
        const name = `${s.category}-${s.skuId}-reveal`;
        return { name, exists: !force && clipExists(outDir, name) };
      })(),
    };
  });

  const veoPending = plans.flatMap((p) => p.veo).filter((v) => !v.exists).length;
  const veoSkipped = plans.flatMap((p) => p.veo).filter((v) => v.exists).length;
  const klingPending = plans.filter((p) => p.kling && !p.kling.exists).length;
  const klingSkipped = plans.filter((p) => p.kling?.exists).length;
  const perClip = estimateKlingCost(KLING_MODEL, KLING_SECONDS, audioOn);
  const klingCost = klingPending * perClip;
  const fmt = (n: number) => `$${n.toFixed(2)}`;

  if (isDryRun) {
    console.log("\n══════════════════════════════════════════════");
    console.log(`  Clip Batch Plan — ${path.basename(storeDir)}  [DRY RUN]`);
    console.log("══════════════════════════════════════════════");
    console.log(`  SKUs found  : ${skus.length} total → ${batch.length} in batch`);
    console.log(`  Veo clips   : ${veoPending} to render (${veoSkipped} already exist) — ${veoModel} tier, ${veoAspect}, FREE`);
    console.log(`  Kling clips : ${klingPending} to render (${klingSkipped} already exist) — ${KLING_SECONDS}s ${KLING_MODEL}, audio ${audioOn ? "on" : "off"}, ~${fmt(perClip)}/clip → ~${fmt(klingCost)} total`);
    console.log(`  Output      : ${exportRoot}\n`);
    for (const p of plans) {
      console.log(`┌─ ${p.sku.category}/${p.sku.skuId}`);
      for (const v of p.veo) console.log(`│  [VEO ${v.index + 1}] ${v.exists ? "SKIP (exists)" : `"${v.scene.slice(0, 70)}…"`}`);
      if (p.kling) console.log(`│  [KLING] ${p.kling.exists ? "SKIP (exists)" : `studio_01 → ${path.basename(p.sku.endImage)}  ~${fmt(perClip)}`}`);
      else if (!veoOnly) console.log(`│  [KLING] SKIP — no lifestyle frame`);
      console.log(`└──`);
    }
    console.log(`\n✅ Dry-run complete. Remove --dry-run to execute${klingPending ? " (paid Kling clips also need --yes)" : ""}.\n`);
    return;
  }

  // ---- ENFORCED spend gate (before any paid call) ----
  if (klingPending > 0) {
    const maxSpend = parseFloat(arg("--max-spend") ?? process.env.MACRO_PICKLE_MAX_SPEND_USD ?? "25");
    if (!Number.isFinite(maxSpend) || maxSpend <= 0) {
      console.error(`❌ invalid --max-spend / MACRO_PICKLE_MAX_SPEND_USD`);
      process.exit(1);
    }
    if (klingCost > maxSpend) {
      console.error(`🛑 estimated Kling spend ${fmt(klingCost)} exceeds the ${fmt(maxSpend)} cap.`);
      console.error(`   Narrow the batch (--skus/--limit), use --veo-only, or raise --max-spend explicitly.`);
      process.exit(1);
    }
    if (!hasFlag("--yes")) {
      console.error(`🛑 this run spends real money on fal.ai: ${klingPending} Kling clip(s) ≈ ${fmt(klingCost)}.`);
      console.error(`   Re-run with --yes to confirm (or --dry-run to preview, --veo-only for $0).`);
      process.exit(1);
    }
  }

  console.log(`\n🎬 ${path.basename(storeDir)} batch: ${batch.length} SKUs → ${veoPending + klingPending} clips to render (${veoSkipped + klingSkipped} already exist)`);
  if (!veoOnly) console.log(`   Kling est. cost: ~${fmt(klingCost)} (${klingPending} × ${KLING_SECONDS}s ${KLING_MODEL}, audio ${audioOn ? "on" : "off"}) — fal.ai, real spend`);
  if (!klingOnly) console.log(`   Veo: FREE (${veoModel} tier, referenceType:ASSET)`);
  console.log();

  let veoOk = 0, veoFail = 0, veoSkip = veoSkipped, klingOk = 0, klingFail = 0, klingSkip = klingSkipped;
  let klingSpent = 0;
  let veoQuotaDead = false;   // daily Veo quota exhausted → stop burning the batch on it
  let klingDead = false;      // fal balance exhausted → stop attempting paid clips

  for (const p of plans) {
    const s = p.sku;
    console.log(`\n▶ ${s.category}/${s.skuId}`);

    // Read + encode the 3 studio refs ONCE per SKU (was once per scene).
    const refFrames: VeoFrame[] | undefined = p.veo.some((v) => !v.exists)
      ? s.studioRefs.map((f) => ({ buffer: fs.readFileSync(f), mimeType: mimeForImage(f) }))
      : undefined;

    for (const v of p.veo) {
      if (v.exists) { console.log(`  Veo scene ${v.index + 1} — SKIP (exists)`); continue; }
      if (veoQuotaDead) { console.log(`  Veo scene ${v.index + 1} — SKIP (daily quota exhausted)`); veoSkip++; continue; }
      process.stdout.write(`  Veo scene ${v.index + 1} [${veoModel}] …`);
      try {
        const r = await generateVideo({ prompt: v.scene, refs: refFrames, outDir: p.outDir, name: v.name, model: veoModel, aspect: veoAspect, onTick: () => process.stdout.write(".") });
        console.log(` ✅ ${path.basename(r.file)} (${Math.round((r.bytes / 1048576) * 10) / 10}MB)`);
        veoOk++;
      } catch (err) {
        if (err instanceof QuotaExhaustedError) {
          console.log(` 🛑 ${err.message}`);
          console.log(`     → skipping all remaining Veo clips this run (already-rendered clips are kept; re-run tomorrow to resume).`);
          veoQuotaDead = true;
          veoSkip++;
        } else {
          console.log(` ❌ ${err instanceof Error ? err.message : err}`);
          veoFail++;
        }
      }
    }

    if (p.kling) {
      if (p.kling.exists) { console.log(`  Kling reveal — SKIP (exists)`); continue; }
      if (klingDead) { console.log(`  Kling reveal — SKIP (fal balance exhausted)`); klingSkip++; continue; }
      process.stdout.write(`  Kling reveal …`);
      try {
        const r = await generateKlingVideo({ prompt: s.klingPrompt, imagePath: s.startImage, endImagePath: s.endImage, duration: "5", generateAudio: audioOn, outDir: p.outDir, name: p.kling.name, model: KLING_MODEL, onTick: () => process.stdout.write(".") });
        console.log(` ✅ ${path.basename(r.file)} (${Math.round((r.bytes / 1048576) * 10) / 10}MB)`);
        klingOk++;
        klingSpent += r.estimatedCostUsd;
      } catch (err) {
        if (err instanceof QuotaExhaustedError && err.kind === "balance") {
          console.log(` 🛑 ${err.message}`);
          console.log(`     → skipping all remaining Kling clips this run.`);
          klingDead = true;
          klingSkip++;
        } else {
          console.log(` ❌ ${err instanceof Error ? err.message : err}`);
          klingFail++;
        }
      }
    }
  }

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${path.basename(storeDir)} Batch — Complete`);
  console.log("══════════════════════════════════════════════");
  if (!klingOnly) console.log(`  Veo:   ${veoOk} ok  |  ${veoFail} failed  |  ${veoSkip} skipped`);
  if (!veoOnly) console.log(`  Kling: ${klingOk} ok  |  ${klingFail} failed  |  ${klingSkip} skipped  |  ~${fmt(klingSpent)} spent`);
  console.log(`  Output: ${exportRoot}\n`);
  if (veoQuotaDead) console.log(`  ↻ Veo daily quota hit — re-run the same command tomorrow; existing clips are skipped automatically.\n`);
}

main();
