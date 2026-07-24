/**
 * scripts/models.ts  —  `pnpm models <command>`
 *
 * Browse the cross-provider AI video-model registry, pick which model(s) to use,
 * and check that each selected model's environment API key is set — the setup
 * step before the (future) membership generation pipeline. DB-free: selection
 * persists to .macro-pickle/models.selection.json (gitignored).
 *
 *   pnpm models list [--provider fal] [--cap startEndKeyframe] [--status recommended]
 *   pnpm models providers
 *   pnpm models select omni-flash,seedance-2.0,wan-2.7
 *   pnpm models status
 *   pnpm models routes
 */

import { config as loadEnv } from "dotenv";
import {
  listModels,
  loadSelection,
  saveSelection,
  readiness,
  SELECTION_PATH,
  PROVIDERS,
  MODEL_ROUTES,
  type Capability,
  type ModelStatus,
  type Provider,
} from "./lib/models/index.js";

loadEnv({ path: ".env.local" });
loadEnv();

const argv = process.argv.slice(2);
const command = argv[0] ?? "list";
const arg = (f: string): string | undefined => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

function cmdList(): void {
  const provider = arg("--provider") as Provider | undefined;
  const capability = arg("--cap") as Capability | undefined;
  const status = arg("--status") as ModelStatus | undefined;
  const rows = listModels({ provider, capability, status });
  console.log(`\n${rows.length} model(s):\n`);
  for (const m of rows) {
    const price = m.price.perSecondUsd != null ? `$${m.price.perSecondUsd}/s` : m.price.note ?? "—";
    const flag = m.verified ? "" : "  ⚠ unverified (see notes)";
    console.log(
      `  ${m.status.padEnd(12)} ${m.id.padEnd(22)} ${m.provider.padEnd(9)} ${price.padEnd(11)} [${m.capabilities.join(",")}]${flag}`
    );
  }
  console.log(
    `\n  filters: --provider <${Object.keys(PROVIDERS).join("|")}>  --cap <t2v|i2v|startEndKeyframe|references|v2v|audio>  --status <recommended|wired|alternate|watch|disqualified>\n`
  );
}

function cmdProviders(): void {
  console.log("\nProviders + the env key each needs:\n");
  for (const p of Object.values(PROVIDERS)) {
    const present = process.env[p.envKey] ? "✓ set" : "✗ missing";
    console.log(`  ${p.id.padEnd(10)} ${p.envKey.padEnd(20)} ${present.padEnd(10)} ${p.label}`);
    console.log(`             get a key: ${p.signupUrl}`);
  }
  console.log();
}

function cmdSelect(): void {
  const raw = argv[1];
  if (!raw || raw.startsWith("--")) {
    console.error("usage: pnpm models select <id,id,...>   (e.g. omni-flash,seedance-2.0,wan-2.7)");
    process.exitCode = 1;
    return;
  }
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const sel = saveSelection(ids);
    console.log(`\n✅ selected ${sel.selected.length} model(s): ${sel.selected.join(", ")}`);
    console.log(`   saved → ${SELECTION_PATH}`);
    console.log(`   next: pnpm models status  (checks each model's env API key)\n`);
  } catch (err) {
    console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

function cmdStatus(): void {
  const sel = loadSelection();
  const rows = readiness(sel.selected);
  console.log(`\nSelected models — readiness (${SELECTION_PATH}):\n`);
  let allReady = true;
  for (const r of rows) {
    const mark = r.ready ? "✅ ready " : "⛔ blocked";
    if (!r.ready) allReady = false;
    console.log(`  ${mark} ${r.id.padEnd(22)} ${r.envKey.padEnd(20)} ${r.reason ?? ""}`);
  }
  console.log(
    allReady
      ? "\n  all selected models are ready to call.\n"
      : "\n  set the missing key(s) in .env.local, then re-run `pnpm models status`.\n"
  );
}

function cmdRoutes(): void {
  console.log("\nRoute manifest (future web/membership layer — not yet mounted):\n");
  for (const r of MODEL_ROUTES) {
    console.log(`  ${r.method.padEnd(4)} ${r.path.padEnd(28)} ${(r.auth ? "auth" : "public").padEnd(7)} → ${r.handler}`);
  }
  console.log();
}

switch (command) {
  case "list":
    cmdList();
    break;
  case "providers":
    cmdProviders();
    break;
  case "select":
    cmdSelect();
    break;
  case "status":
    cmdStatus();
    break;
  case "routes":
    cmdRoutes();
    break;
  default:
    console.error(`unknown command: ${command}\n  usage: pnpm models <list|providers|select|status|routes>`);
    process.exitCode = 1;
}
