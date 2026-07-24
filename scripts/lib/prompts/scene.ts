/**
 * scripts/lib/prompts/scene.ts
 *
 * Scene serialization + linting. sceneToMarkdown writes the canonical
 * content/*-prompts.md block; lintScene turns the gem-guide "Command 5:
 * Continuity & IP-Safety Linter" prose into a real check (IP-safe proxies,
 * fixed camera, stationary-cycle, single-beat rule, atmospherics).
 */

import type { Scene } from "./types.js";

export function sceneToMarkdown(scene: Scene): string {
  const beats = scene.beats.map((b) => `- ${b.time}: ${b.action}`).join("\n");
  const atmos = scene.atmospherics
    ? `\n- ATMOSPHERIC DETAILS: ${scene.atmospherics}`
    : "";
  return [
    `## PROMPT ${scene.number}: "${scene.title}"`,
    `**Scene**: ${scene.summary}`,
    "",
    "```",
    `SCENE: ${scene.setting}.`,
    `SUBJECT: ${scene.subject}`,
    "ACTION:",
    beats + atmos,
    `STYLE: ${scene.style}`,
    "```",
  ].join("\n");
}

export interface LintIssue {
  severity: "error" | "warn";
  rule: string;
  message: string;
}

/** Copyrighted names that must be swapped for descriptive proxies before render. */
const IP_NAMES: RegExp[] = [
  /richie rich/i,
  /scrooge mcduck/i,
  /mr\.?\s*monopoly/i,
  /monopoly man/i,
  /jessica rabbit/i,
  /spider-?man/i,
  /\bmario\b/i,
  /mickey mouse/i,
  /batman/i,
  /pikachu/i,
];

export function lintScene(scene: Scene): LintIssue[] {
  const issues: LintIssue[] = [];
  const hay = [
    scene.subject,
    scene.title,
    scene.summary,
    scene.beats.map((b) => b.action).join(" "),
  ].join(" ");

  for (const re of IP_NAMES) {
    if (re.test(hay)) {
      issues.push({
        severity: "error",
        rule: "ip-safety",
        message: `Copyrighted name matched ${re} — replace with a descriptive visual proxy.`,
      });
    }
  }

  if (scene.beats.length === 0) {
    issues.push({
      severity: "error",
      rule: "beats",
      message: "Scene has no action beats.",
    });
  }
  if (scene.beats.length > 4) {
    issues.push({
      severity: "warn",
      rule: "single-beat",
      message: `${scene.beats.length} beats — overloaded. An 8s clip holds ~1-2 beats (4 max for longer clips); overloading degrades output.`,
    });
  }
  if (!scene.atmospherics) {
    issues.push({
      severity: "warn",
      rule: "atmospherics",
      message:
        "No looping atmospheric motion — the frame may read as static. Add haze / particles / birds / flicker.",
    });
  }

  const movement = /(walk|run|drive|cruis|march|fly|sprint|jog)/i;
  const stationary = /(stationary|in place|background slid|background-slid|treadmill)/i;
  if (movement.test(hay) && !stationary.test(hay)) {
    issues.push({
      severity: "warn",
      rule: "stationary-cycle",
      message:
        "Movement without a stationary-cycle / background-slide callout — risks character warping.",
    });
  }

  const dynamicCam = /(zoom|dolly|pan|tilt|orbit|crane|push-in|pull-out|track)/i;
  const fixedCam = /(fixed|locked|static|steady)/i;
  if (dynamicCam.test(hay) && !fixedCam.test(hay)) {
    issues.push({
      severity: "warn",
      rule: "fixed-camera",
      message:
        "Dynamic camera language without a fixed/locked callout — Veo continuity may drift.",
    });
  }

  return issues;
}
