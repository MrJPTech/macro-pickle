/**
 * scripts/lib/models/routes.ts
 *
 * Route MANIFEST for the future web/membership layer — pure data, no HTTP
 * framework glue (the web UI + database + login are deliberately deferred).
 * A later Next.js / Express / MCP layer mounts these paths onto the named
 * handler functions exported by select.ts and dispatch.ts.
 *
 * Keeping the contract here means the API shape is decided and reviewable now,
 * before any server exists.
 */

export interface RouteDef {
  id: string;
  method: "GET" | "POST";
  path: string;
  summary: string;
  /** Handler function/const to mount (exported from select.ts / providers.ts / dispatch.ts). */
  handler: string;
  /** Requires an authenticated member (once login exists). */
  auth: boolean;
}

export const MODEL_ROUTES: RouteDef[] = [
  { id: "list-models", method: "GET", path: "/api/models", summary: "List available video models (optionally filtered)", handler: "listModels", auth: false },
  { id: "get-model", method: "GET", path: "/api/models/:id", summary: "Get one model's details", handler: "getModel", auth: false },
  { id: "providers", method: "GET", path: "/api/providers", summary: "List providers + the env key each requires", handler: "PROVIDERS", auth: false },
  { id: "get-selection", method: "GET", path: "/api/selection", summary: "Get the member's selected models", handler: "loadSelection", auth: true },
  { id: "set-selection", method: "POST", path: "/api/selection", summary: "Set the member's selected models", handler: "saveSelection", auth: true },
  { id: "readiness", method: "GET", path: "/api/readiness", summary: "Per-selected-model env-key readiness pre-flight", handler: "readiness", auth: true },
  { id: "generate", method: "POST", path: "/api/models/:id/generate", summary: "Run a generation (resolves env key, dispatches to the provider)", handler: "runGeneration", auth: true },
];
