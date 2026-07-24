/**
 * Local media-pipeline types. Everything lives on disk as JSON + image/video
 * files under `pipeline-output/<slug>/` — no database.
 */

export interface ScenePrompt {
  id: string;
  /** The rough idea you write. */
  text: string;
  /** Filled by the enhancer (Stage-1 image or Stage-2 video). */
  enhanced?: string;
  /** Reference candidates to generate for this prompt (Stage 1 only). */
  count?: number;
  /** Prompt category for the enhancer (Stage 1 only). */
  kind?: "general" | "character" | "scene" | "keyframe";
}

export type MediaStage = "reference" | "video";

export interface MediaRecord {
  id: string;
  stage: MediaStage;
  /** Which ScenePrompt produced this. */
  promptId: string;
  /** Path relative to the scene directory, e.g. "references/ref_abc.png". */
  file: string;
  mimeType: string;
  model: string;
  rawPrompt: string;
  finalPrompt: string;
  params: Record<string, unknown>;
  /** Reference candidates you keep for Stage 2 (curation flag). */
  selected: boolean;
  createdAt: string;
}

export interface ReferenceStageConfig {
  /** Model alias (nano-banana-pro | nano-banana-2 | nano-banana) or raw id. */
  model: string;
  aspectRatio: string;
  style?: string;
  negativePrompt?: string;
  /** Run the CoT prompt enhancer before generating. */
  enhance: boolean;
  prompts: ScenePrompt[];
}

export interface VideoStageConfig {
  /** Model alias (veo-3.1 | veo-3.1-fast | veo-3) or raw id. */
  model: string;
  aspectRatio: string;
  resolution?: string;
  negativePrompt?: string;
  generateAudio?: boolean;
  enhance: boolean;
  /** How selected reference frames map onto Veo inputs. */
  useSelectedAs: "ingredients" | "firstLast" | "firstFrame";
  /** Analyze selected frames with vision and feed back into the prompt. */
  groundWithVision?: boolean;
  prompts: ScenePrompt[];
}

export interface SceneManifest {
  slug: string;
  title: string;
  description?: string;
  createdAt: string;
  reference: ReferenceStageConfig;
  video: VideoStageConfig;
  media: MediaRecord[];
}
