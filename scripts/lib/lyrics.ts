/**
 * scripts/lib/lyrics.ts
 *
 * Lyric-sync loader for the macro-pickle pipeline. Reads a track's lyric map
 * (content/lyrics/<track>.json) and exposes the bars synced to a given shot key.
 * Generic + opt-in: callers pass an explicit track; an absent file is a no-op.
 *
 * COMPLIANCE: lyrics are the AUDIO BED only. `lyricFor()` returns text destined
 * for a "LYRIC SYNC" note on the Director Brief — never on-screen text, never a
 * literal depiction. The brand NEGATIVE blocks any offense/method imagery.
 */

import fs from "fs";
import path from "path";

export interface LyricBar { n: number; text: string; theme?: string }
export interface ShotSync {
  shot: string;
  bars: number[];
  audioBed?: string;
  safeMotif?: string;
  note?: string;
}
export interface LyricMap {
  track: string;
  artist?: string;
  bpm?: number;
  bars: LyricBar[];
  shotSync: ShotSync[];
}

const CACHE = new Map<string, LyricMap>();

/** Load content/lyrics/<track>.json. Returns an empty map if the file is absent. */
export function loadLyrics(track: string): LyricMap {
  if (CACHE.has(track)) return CACHE.get(track)!;
  const p = path.join("content", "lyrics", `${track}.json`);
  const map: LyricMap = fs.existsSync(p)
    ? (JSON.parse(fs.readFileSync(p, "utf-8")) as LyricMap)
    : { track, bars: [], shotSync: [] };
  CACHE.set(track, map);
  return map;
}

/** The shotSync entry whose `shot` is a prefix of (or equals) the given key. */
function syncFor(key: string, track: string): ShotSync | undefined {
  const { shotSync } = loadLyrics(track);
  return (
    shotSync.find((s) => s.shot === key) ??
    shotSync.find((s) => key.startsWith(s.shot) || s.shot.startsWith(key))
  );
}

/**
 * The synced bar text for a shot, joined for the LYRIC SYNC note — or undefined
 * if the shot is pre-vocal / a media interlude (no bars). Safe to assign to
 * `VideoBrief.lyric` unconditionally.
 */
export function lyricFor(key: string, track: string): string | undefined {
  const sync = syncFor(key, track);
  if (!sync?.bars?.length) return undefined;
  const { bars } = loadLyrics(track);
  const text = sync.bars
    .map((n) => bars.find((b) => b.n === n)?.text)
    .filter(Boolean)
    .join(" / ");
  return text || undefined;
}

/** Full sync metadata for a shot (bars + audioBed + safeMotif + note). */
export function lyricSyncFor(key: string, track: string): ShotSync | undefined {
  return syncFor(key, track);
}
