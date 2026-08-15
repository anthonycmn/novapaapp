import type { RegistrationProvider } from "./provider";
import { MockRegistrationProvider } from "./mock";
import { CustomPortalRegistrationProvider } from "./custom";
import { WebsiteDbRegistrationProvider } from "./website";

/**
 * Picks the registration adapter.
 *  1. An explicit HTTP API (REGISTRATION_API_URL + KEY) wins if configured.
 *  2. In supabase mode the real answer is the website's own tables in the
 *     shared novapa database — no HTTP API needed.
 *  3. Otherwise the mock keeps the whole sync flow demo-able.
 */
let cached: RegistrationProvider | null = null;

export function getRegistrationProvider(): RegistrationProvider {
  if (cached) return cached;
  const baseUrl = process.env.REGISTRATION_API_URL;
  const apiKey = process.env.REGISTRATION_API_KEY;
  const supabaseMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  cached =
    baseUrl && apiKey
      ? new CustomPortalRegistrationProvider(baseUrl, apiKey)
      : supabaseMode
        ? new WebsiteDbRegistrationProvider()
        : new MockRegistrationProvider();
  return cached;
}

/** Test seam. */
export function setRegistrationProvider(provider: RegistrationProvider | null): void {
  cached = provider;
}

export { MockRegistrationProvider } from "./mock";
export { CustomPortalRegistrationProvider, mapSnapshot } from "./custom";
export {
  WebsiteDbRegistrationProvider,
  fetchWebsiteCastRoster,
  fetchCoachingActivityIds,
  type WebsiteCastRosterEntry,
} from "./website";
export { RegistrationUnavailableError } from "./provider";
export type { RegistrationProvider } from "./provider";
export { reconcile } from "./reconcile";
export type { ReconcilePlan, ReconcileInput } from "./reconcile";
export * from "./types";
