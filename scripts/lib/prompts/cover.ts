/**
 * scripts/lib/prompts/cover.ts
 *
 * Canonical CMS cover-image prompt. Single source of truth, deduped from the
 * two copies that previously lived in scripts/generate-images.ts and
 * src/lib/google-ai/imagen-client.ts.
 */

export function coverPrompt(
  title: string,
  description: string | undefined,
  contentType: string
): string {
  return (
    `Professional, modern cover image for a ${contentType} titled "${title}". ` +
    `${description ? `About: ${description}.` : ""} Clean design, subtle gradients, ` +
    `abstract tech elements, dark theme with purple/blue accent colors. No text in the image.`
  );
}
