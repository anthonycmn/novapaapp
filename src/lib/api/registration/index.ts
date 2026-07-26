import type { RegistrationProvider } from "./provider";
import { MockRegistrationProvider } from "./mock";
import { CustomPortalRegistrationProvider } from "./custom";

/**
 * Picks the registration adapter. Uses the org's own portal when
 * REGISTRATION_API_URL + REGISTRATION_API_KEY are configured; otherwise runs
 * on the mock so the whole sync flow stays demo-able (NEEDS-FROM-TONY.md #8).
 */
let cached: RegistrationProvider | null = null;

export function getRegistrationProvider(): RegistrationProvider {
  if (cached) return cached;
  const baseUrl = process.env.REGISTRATION_API_URL;
  const apiKey = process.env.REGISTRATION_API_KEY;
  cached =
    baseUrl && apiKey
      ? new CustomPortalRegistrationProvider(baseUrl, apiKey)
      : new MockRegistrationProvider();
  return cached;
}

/** Test seam. */
export function setRegistrationProvider(provider: RegistrationProvider | null): void {
  cached = provider;
}

export { MockRegistrationProvider } from "./mock";
export { CustomPortalRegistrationProvider, mapSnapshot } from "./custom";
export { RegistrationUnavailableError } from "./provider";
export type { RegistrationProvider } from "./provider";
export { reconcile } from "./reconcile";
export type { ReconcilePlan, ReconcileInput } from "./reconcile";
export * from "./types";
