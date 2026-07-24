/**
 * scripts/lib/retry.ts
 *
 * Shared failure taxonomy + retry policy for the generation rails — the one
 * home for the pattern the batch scripts were each hand-rolling:
 *   - transient 429 / per-minute rate limits → exponential backoff, retry
 *   - Google AI Studio monthly spend cap     → abort immediately (retry is futile)
 *   - daily free-tier quota (Veo)            → abort immediately (resets next day)
 *   - fal.ai exhausted balance               → abort immediately (needs a top-up)
 */

export type GenErrorKind = "spend-cap" | "quota-daily" | "balance" | "transient" | "other";

/** Thrown for hard stops so batch loops can abort instead of burning the rest of a dead quota. */
export class QuotaExhaustedError extends Error {
  constructor(
    message: string,
    public readonly kind: Exclude<GenErrorKind, "transient" | "other">
  ) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

export function classifyGenError(err: unknown): GenErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  if (/spend(ing)?[ -]?cap/i.test(msg)) return "spend-cap";
  if (/exhausted balance|insufficient (funds|balance)|payment required|402/i.test(msg)) return "balance";
  if (/429|resource[ _]?exhausted|quota|rate[ -]?limit/i.test(msg)) {
    // Daily free-tier caps name the per-day quota metric; per-minute limits don't.
    return /per[ -_]?day|daily/i.test(msg) ? "quota-daily" : "transient";
  }
  return "other";
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface RetryOptions {
  /** Max retries after the first attempt. Default 3. */
  retries?: number;
  /** First backoff delay; doubles each retry. Default 30s (matches free-tier per-minute windows). */
  baseDelayMs?: number;
  /** Printed in backoff messages, e.g. "veo submit". */
  label?: string;
}

/**
 * Run an API call under the shared policy. Transient rate limits back off and
 * retry; spend cap / daily quota / exhausted balance throw QuotaExhaustedError
 * immediately. Anything else rethrows untouched.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const base = opts.baseDelayMs ?? 30_000;
  const label = opts.label ?? "call";
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      switch (classifyGenError(err)) {
        case "spend-cap":
          throw new QuotaExhaustedError(
            `Google AI Studio monthly SPEND CAP reached — raise it at https://ai.studio/spend. (${msg})`,
            "spend-cap"
          );
        case "quota-daily":
          throw new QuotaExhaustedError(
            `daily free-tier quota exhausted — resets next day. (${msg})`,
            "quota-daily"
          );
        case "balance":
          throw new QuotaExhaustedError(
            `fal.ai balance exhausted — top up before re-running. (${msg})`,
            "balance"
          );
        case "transient":
          if (attempt < retries) {
            const wait = base * Math.pow(2, attempt);
            console.warn(
              `  ⏳ ${label}: rate-limited — backoff ${Math.round(wait / 1000)}s (retry ${attempt + 1}/${retries})`
            );
            await sleep(wait);
            continue;
          }
          throw err;
        default:
          throw err;
      }
    }
  }
}
