/**
 * scripts/rank-skus.ts  —  `pnpm rank-skus`
 *
 * Rank a store's SKUs by SALES (the 1688 booked-count demand signal) so a batch
 * generation run targets the proven winners instead of every SKU. Reads the store's
 * `manifest.json` (offerId → sales/title/price) and the gen5 reference sets on disk.
 *
 * Supabase-free. ZERO API calls — pure local file read, so it's always safe to run.
 *
 *   pnpm rank-skus --store <media-dir>          # required: <dir>/<category>/<sku>/gen5 + manifest.json
 *   pnpm rank-skus --store <dir> --top 8         # show only the top N
 *   pnpm rank-skus --store <dir> --top 8 --ids   # print ONLY the top-N SKU ids (CSV) → feed `gen-clips --skus`
 *   pnpm rank-skus --store <dir> --all           # include SKUs with no gen5 set (not clip-ready)
 *   pnpm rank-skus --store <dir> --json          # JSON out
 *
 * Set MACRO_PICKLE_STORE_DIR to skip passing --store every time.
 *
 * Pairs with `pnpm gen-clips` (/pickle-clips): rank → pick the top ids → generate.
 */

import fs from "fs";
import path from "path";

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (flag: string) => process.argv.includes(flag);

interface ManifestEntry {
  offerId?: string;
  sales?: string | number;
  title?: string;
  price_rmb?: string | number;
  theme?: string;
}
interface Ranked {
  category: string;
  sku: string;
  sales: number;
  salesRaw: string;
  price: string;
  title: string;
  hasGen5: boolean;
  hasLife: boolean;
}

function toInt(v: unknown): number {
  return parseInt(String(v ?? "").replace(/[^0-9]/g, ""), 10) || 0;
}

function rank(storeDir: string, includeAll: boolean): Ranked[] {
  const manifestPath = path.join(storeDir, "manifest.json");
  const byId: Record<string, ManifestEntry> = {};
  if (fs.existsSync(manifestPath)) {
    const raw = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<string, ManifestEntry>;
    for (const e of Object.values(raw)) if (e?.offerId) byId[e.offerId] = e;
  }

  const rows: Ranked[] = [];
  const categories = fs
    .readdirSync(storeDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categories) {
    const catDir = path.join(storeDir, category);
    let skuDirs: string[];
    try {
      skuDirs = fs.readdirSync(catDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const sku of skuDirs) {
      const gen5 = path.join(catDir, sku, "gen5");
      const hasGen5 = fs.existsSync(path.join(gen5, "studio_01.png"));
      if (!hasGen5 && !includeAll) continue;
      const m = byId[sku] ?? {};
      rows.push({
        category,
        sku,
        sales: toInt(m.sales),
        salesRaw: String(m.sales ?? "0"),
        price: String(m.price_rmb ?? "?"),
        title: (m.title ?? "(no manifest match)").slice(0, 30),
        hasGen5,
        hasLife: fs.existsSync(path.join(gen5, "life_01.png")) || fs.existsSync(path.join(gen5, "life_02.png")),
      });
    }
  }
  rows.sort((a, b) => b.sales - a.sales);
  return rows;
}

function main() {
  const storeDir = arg("--store") ?? process.env.MACRO_PICKLE_STORE_DIR;
  if (!storeDir) {
    console.error(
      "❌ no store dir. Pass --store <media-dir> or set MACRO_PICKLE_STORE_DIR.\n" +
        "   Expected layout: <dir>/manifest.json + <dir>/<category>/<sku>/gen5/"
    );
    process.exit(1);
  }
  if (!fs.existsSync(storeDir)) {
    console.error(`❌ store dir not found: ${storeDir}`);
    process.exit(1);
  }
  const top = arg("--top") ? parseInt(arg("--top")!, 10) : 0;
  const includeAll = has("--all");

  let rows = rank(storeDir, includeAll);
  if (top > 0) rows = rows.slice(0, top);

  // --ids: just the CSV of SKU ids (for piping into `gen-clips --skus`)
  if (has("--ids")) {
    console.log(rows.map((r) => r.sku).join(","));
    return;
  }
  if (has("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const clipReady = rows.filter((r) => r.hasGen5).length;
  console.log(`\n📊 SKU ranking by sales — ${path.basename(storeDir)}`);
  console.log(`   ${rows.length} shown${top ? ` (top ${top})` : ""} · ${clipReady} clip-ready (have gen5)\n`);
  console.log("  #   SALES    ¥     CATEGORY/SKU                        TITLE");
  rows.forEach((r, i) =>
    console.log(
      `${String(i + 1).padStart(3)}  ${r.salesRaw.padStart(7)}  ${String(r.price).padStart(4)}  ` +
        `${(r.category + "/" + r.sku).padEnd(34)}  ${r.title}` +
        `${r.hasGen5 ? "" : "  [no-gen5]"}${r.hasGen5 && !r.hasLife ? "  [no-life]" : ""}`
    )
  );
  console.log(`\n  → feed the winners to clips:  pnpm rank-skus --top ${top || 8} --ids  |  pnpm gen-clips --store "${storeDir}" --skus <paste>\n`);
}

main();
