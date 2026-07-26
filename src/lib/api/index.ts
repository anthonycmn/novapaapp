import type { DataProvider } from "./provider";
import { MockDataProvider } from "./mock/provider";

/**
 * Data-mode switch. "mock" (default) runs entirely in-process with seed
 * data; "supabase" uses the real backend once credentials exist
 * (.env.example). Components never import adapters directly — always
 * `getProvider()`.
 */
let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "mock";
  if (mode === "supabase") {
    // The Supabase adapter is wired in once a project exists
    // (NEEDS-FROM-TONY.md #1). Until then, fail loudly rather than
    // silently serving mock data in a "real" deployment.
    throw new Error(
      "NEXT_PUBLIC_DATA_MODE=supabase but the Supabase adapter is not configured yet. " +
        "See NEEDS-FROM-TONY.md #1, then wire src/lib/api/supabase/provider.ts."
    );
  }
  cached = new MockDataProvider();
  return cached;
}

export { AccessDeniedError } from "./provider";
export type { DataProvider } from "./provider";
export * from "./types";
