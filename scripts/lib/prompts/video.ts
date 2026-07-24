/**
 * scripts/lib/prompts/video.ts
 *
 * buildVideoPrompt — renders a VideoBrief into a Veo 3.1 / Flow "Director Brief"
 * block (Scene · Subject · Camera · Action · Audio · Pacing/Style), seeded
 * optionally by an INTENT_PRESET, with @-references, a consistency clause, and a
 * negative list. Output is a labeled text block (proven format from the Seedance
 * corpus + the existing gemini-gem-guide canonical schema).
 */

import type { VideoBrief } from "./types.js";
import { CONSISTENCY_CLAUSE, resolveNegative } from "./presets.js";
import { INTENT_PRESETS } from "./camera.js";
import { loadBrandProfile } from "./brand.js";

export function buildVideoPrompt(brief: VideoBrief): string {
  const brand = brief.brand ? loadBrandProfile(brief.brand) : undefined;
  const intent = brief.intent ? INTENT_PRESETS[brief.intent] : undefined;

  const lines: string[] = ["[DIRECTOR BRIEF]"];
  if (brief.format) lines.push(`FORMAT: ${brief.format} (short-form vertical UGC)`);
  lines.push(`SCENE: ${brief.scene}`);
  lines.push(`SUBJECT: ${brief.subject}`);

  const size = brief.camera?.size ?? intent?.framing;
  const move = brief.camera?.move ?? intent?.move;
  const lens = brief.camera?.lens ?? intent?.lens;
  const cam = [size, move, lens ? `${lens} lens` : undefined, brief.camera?.speed]
    .filter(Boolean)
    .join(", ");
  if (cam) lines.push(`CAMERA: ${cam}`);

  if (brief.beats?.length) {
    lines.push("ACTION:");
    for (const b of brief.beats) lines.push(`- ${b.time}: ${b.action}`);
  }

  if (brief.audio) lines.push(`AUDIO: ${brief.audio}`);
  // The lyric is the AUDIO BED only — never rendered, never depicted. The raw bars
  // stay out of the model-facing prompt (they trip Flow/Veo's content filter and
  // they are never generated anyway); the editor reads the synced bars from the
  // lyric sheet (content/lyrics/<track>.json) + the source brief, not from this prompt.
  if (brief.lyric)
    lines.push(
      "LYRIC SYNC: lip-sync the performance to the track's vocal at this beat (audio bed only — never on-screen text, never depicted; the synced bars live in the lyric sheet, not in this prompt)"
    );

  // On-screen captions are an EDIT/POST overlay (kinetic captions the editor burns
  // in) — never rendered by the model, since Veo text garbles. Same discipline as
  // the LYRIC SYNC line above; the NEGATIVE list keeps generated in-video text out.
  if (brief.captions?.length) {
    lines.push(
      "ON-SCREEN CAPTIONS (edit/post overlay — burned in by the editor, NOT rendered by the model; keep each card short and legible):"
    );
    for (const c of brief.captions) lines.push(`- "${c}"`);
  }

  const styleParts = [
    brief.pacing ?? intent?.grade ?? brand?.style,
    brand?.palette?.length ? `palette ${brand.palette.join(", ")}` : undefined,
    intent?.lighting,
  ].filter(Boolean);
  if (styleParts.length) lines.push(`STYLE / PACING: ${styleParts.join("; ")}`);

  if (brief.refs?.length) lines.push(`REFERENCES: ${brief.refs.join("; ")}`);
  if (brief.durationSec) lines.push(`DURATION: ${brief.durationSec}s`);
  lines.push(`ASPECT: ${brief.aspect ?? brand?.aspect ?? "16:9"}`);

  if (brief.consistency) lines.push(CONSISTENCY_CLAUSE);

  const neg = resolveNegative(
    typeof brief.negative === "string" ? brief.negative : undefined
  );
  const negPieces = [
    neg,
    brand?.avoid?.length ? brand.avoid.join(", ") : undefined,
  ].filter(Boolean);
  if (negPieces.length) lines.push(`NEGATIVE: ${negPieces.join(", ")}`);

  return lines.join("\n");
}
