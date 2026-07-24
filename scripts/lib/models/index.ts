/**
 * scripts/lib/models/index.ts
 *
 * Barrel for the cross-provider model registry subsystem. The CLI
 * (scripts/models.ts), the MCP server, and a future web layer import from here.
 *
 *   registry.ts   — the typed model catalog (source of truth)
 *   providers.ts  — provider metadata + env-key resolution (requireApiKey)
 *   select.ts     — list / filter / persist selection / readiness
 *   dispatch.ts   — runGeneration seam (provider→handler; stubs today)
 *   routes.ts     — route manifest for the future web/membership layer
 */

export * from "./registry.js";
export * from "./providers.js";
export * from "./select.js";
export * from "./dispatch.js";
export * from "./routes.js";
