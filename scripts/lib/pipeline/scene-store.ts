import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { join, resolve, basename } from "node:path";
import type { MediaRecord, SceneManifest } from "./types";

/**
 * Local, file-based store for the media pipeline. No database.
 *
 * Layout (root configurable via PIPELINE_DIR, defaults to ./pipeline-output):
 *   pipeline-output/
 *     <slug>/
 *       scene.json        — the manifest (prompts, config, media records)
 *       references/        — Stage-1 candidate frames
 *       video/             — Stage-2 generated clips
 */

export const PIPELINE_ROOT = process.env.PIPELINE_DIR
  ? resolve(process.env.PIPELINE_DIR)
  : resolve(process.cwd(), "pipeline-output");

export function sceneDir(slug: string): string {
  return join(PIPELINE_ROOT, slug);
}
export function referencesDir(slug: string): string {
  return join(sceneDir(slug), "references");
}
export function videoDir(slug: string): string {
  return join(sceneDir(slug), "video");
}
export function manifestPath(slug: string): string {
  return join(sceneDir(slug), "scene.json");
}

export function ensureSceneDirs(slug: string): void {
  for (const dir of [sceneDir(slug), referencesDir(slug), videoDir(slug)]) {
    mkdirSync(dir, { recursive: true });
  }
}

export function sceneExists(slug: string): boolean {
  return existsSync(manifestPath(slug));
}

export function loadScene(slug: string): SceneManifest {
  if (!sceneExists(slug)) {
    throw new Error(
      `Scene "${slug}" not found. Create it with: pnpm scene:new ${slug}`
    );
  }
  return JSON.parse(readFileSync(manifestPath(slug), "utf8")) as SceneManifest;
}

export function saveScene(scene: SceneManifest): void {
  ensureSceneDirs(scene.slug);
  writeFileSync(manifestPath(scene.slug), JSON.stringify(scene, null, 2));
}

export function listScenes(): string[] {
  if (!existsSync(PIPELINE_ROOT)) return [];
  return readdirSync(PIPELINE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(PIPELINE_ROOT, d.name, "scene.json")))
    .map((d) => d.name)
    .sort();
}

/** Absolute path for a media record's stored file. */
export function mediaAbsPath(slug: string, record: MediaRecord): string {
  return join(sceneDir(slug), record.file);
}

let idCounter = 0;
export function makeId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`;
}

/** Append a media record and persist the manifest. */
export function addMedia(scene: SceneManifest, record: MediaRecord): void {
  scene.media.push(record);
  saveScene(scene);
}

/** Load a media file's bytes for use as a reference image. */
export function readMediaBuffer(slug: string, record: MediaRecord): Buffer {
  return readFileSync(mediaAbsPath(slug, record));
}

export function selectedReferences(scene: SceneManifest): MediaRecord[] {
  return scene.media.filter((m) => m.stage === "reference" && m.selected);
}

export function referenceCandidates(scene: SceneManifest): MediaRecord[] {
  return scene.media.filter((m) => m.stage === "reference");
}

/** Short display name for a media record (filename without directory). */
export function mediaName(record: MediaRecord): string {
  return basename(record.file);
}
