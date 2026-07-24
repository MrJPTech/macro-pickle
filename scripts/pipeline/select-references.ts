import "./load-env";
import {
  loadScene,
  saveScene,
  referenceCandidates,
  selectedReferences,
  mediaName,
} from "../lib/pipeline/scene-store";

/**
 * Curate Stage-1 candidates: mark which reference frames advance to video.
 *
 *   pnpm scene:select <slug>                      # list all candidates + status
 *   pnpm scene:select <slug> ref_abc ref_def      # select these (by id or filename)
 *   pnpm scene:select <slug> --clear              # deselect everything
 */

function matches(id: string, filename: string, token: string): boolean {
  return id === token || filename === token || filename.startsWith(token);
}

const slug = process.argv[2];
if (!slug || slug.startsWith("--")) {
  console.error("Usage: pnpm scene:select <slug> [ref_id|filename ...] [--clear]");
  process.exit(1);
}

const scene = loadScene(slug);
const candidates = referenceCandidates(scene);
const tokens = process.argv.slice(3).filter((a) => !a.startsWith("--"));
const clear = process.argv.includes("--clear");

if (candidates.length === 0) {
  console.log(`No reference candidates yet. Run: pnpm scene:refs ${slug}`);
  process.exit(0);
}

if (clear) {
  for (const c of candidates) c.selected = false;
  saveScene(scene);
  console.log("✅ Cleared all selections.");
  process.exit(0);
}

if (tokens.length === 0) {
  // List mode
  console.log(`Reference candidates for "${scene.title}" (${slug}):\n`);
  for (const c of candidates) {
    const mark = c.selected ? "✅" : "  ";
    console.log(`  ${mark} ${c.id}   ${mediaName(c)}   (prompt ${c.promptId})`);
  }
  const sel = selectedReferences(scene).length;
  console.log(`\n${candidates.length} candidate(s), ${sel} selected.`);
  console.log(`Select with: pnpm scene:select ${slug} <id|filename> ...`);
  process.exit(0);
}

let changed = 0;
for (const token of tokens) {
  const match = candidates.find((c) => matches(c.id, mediaName(c), token));
  if (!match) {
    console.warn(`  ⚠️  No candidate matched "${token}"`);
    continue;
  }
  if (!match.selected) {
    match.selected = true;
    changed += 1;
    console.log(`  ✅ Selected ${match.id} (${mediaName(match)})`);
  } else {
    console.log(`  • Already selected ${match.id}`);
  }
}

saveScene(scene);
const total = selectedReferences(scene).length;
console.log(`\n${changed} newly selected · ${total} total selected.`);
console.log(`Next: pnpm scene:video ${slug}`);
