/**
 * scripts/lib/models/select.ts
 *
 * Model selection + readiness. The membership/web layer (later) and the
 * `pnpm models` CLI (now) both use this to:
 *   1. list the available models (optionally filtered),
 *   2. let a user pick which model(s) they want to use,
 *   3. persist that choice (DB-free — a local gitignored JSON config), and
 *   4. check readiness: is each selected model's environment API key present?
 *
 * No database: selection persists to .macro-pickle/models.selection.json
 * (gitignored — user-specific state), mirroring the content/*.json config idiom.
 */

import fs from "fs";
import path from "path";
import { z } from "zod";
import {
  MODEL_REGISTRY,
  getModel,
  type Capability,
  type ModelEntry,
  type ModelStatus,
  type Provider,
} from "./registry.js";
import { resolveApiKey } from "./providers.js";

export interface ModelFilter {
  provider?: Provider;
  capability?: Capability;
  status?: ModelStatus;
}

/** List models, optionally filtered by provider / capability / status. */
export function listModels(filter: ModelFilter = {}): ModelEntry[] {
  return MODEL_REGISTRY.filter(
    (m) =>
      (!filter.provider || m.provider === filter.provider) &&
      (!filter.status || m.status === filter.status) &&
      (!filter.capability || m.capabilities.includes(filter.capability))
  );
}

// ── Persisted selection (DB-free) ───────────────────────────────────────────

export const SelectionSchema = z.object({
  selected: z.array(z.string()),
  updatedAt: z.string().optional(),
});
export type Selection = z.infer<typeof SelectionSchema>;

export const SELECTION_DIR = path.resolve(".macro-pickle");
export const SELECTION_PATH = path.join(SELECTION_DIR, "models.selection.json");

/** Default selection = the shortlist (status: recommended). */
export function defaultSelection(): string[] {
  return MODEL_REGISTRY.filter((m) => m.status === "recommended").map((m) => m.id);
}

/** Load the persisted selection, falling back to the recommended shortlist. */
export function loadSelection(): Selection {
  try {
    const raw = fs.readFileSync(SELECTION_PATH, "utf8");
    const parsed = SelectionSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return parsed.data;
  } catch {
    /* no/invalid selection file — fall through to the default */
  }
  return { selected: defaultSelection() };
}

/** Validate and persist a selection. Rejects unknown or disqualified ids. */
export function saveSelection(ids: string[]): Selection {
  const known = new Set(MODEL_REGISTRY.map((m) => m.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Unknown model id(s): ${unknown.join(", ")}`);

  const disqualified = ids.filter((id) => getModel(id)?.status === "disqualified");
  if (disqualified.length) {
    throw new Error(`Refusing to select disqualified model(s): ${disqualified.join(", ")}`);
  }

  const selection: Selection = { selected: ids, updatedAt: new Date().toISOString() };
  fs.mkdirSync(SELECTION_DIR, { recursive: true });
  fs.writeFileSync(SELECTION_PATH, JSON.stringify(selection, null, 2) + "\n");
  return selection;
}

// ── Readiness (env-key check) ───────────────────────────────────────────────

export interface ReadinessRow {
  id: string;
  label: string;
  provider?: Provider;
  envKey: string;
  ready: boolean;
  reason?: string;
}

/**
 * For each selected model, report whether its environment API key is present
 * (and it isn't disqualified). This is the pre-flight before running a call.
 */
export function readiness(selection?: string[]): ReadinessRow[] {
  const ids = selection ?? loadSelection().selected;
  return ids.map((id): ReadinessRow => {
    const model = getModel(id);
    if (!model) {
      return { id, label: id, envKey: "?", ready: false, reason: "unknown model id (not in registry)" };
    }
    const key = resolveApiKey(model.provider);
    const disqualified = model.status === "disqualified";
    return {
      id: model.id,
      label: model.label,
      provider: model.provider,
      envKey: key.envKey,
      ready: key.present && !disqualified,
      reason: disqualified
        ? "disqualified — do not use"
        : key.present
          ? undefined
          : `set ${key.envKey} in .env.local`,
    };
  });
}
