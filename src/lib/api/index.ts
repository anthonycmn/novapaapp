import type { DataProvider } from "./provider";
import { MockDataProvider } from "./mock/provider";
import { ensureMockStoreLoaded, persistMockStore } from "./mock/persistence";
import { createSupabaseProvider } from "./supabase/provider";

/**
 * Data-mode switch. "mock" (default) runs on the in-process store — with a
 * Netlify Blobs snapshot layered on in deployment, so writes survive across
 * serverless instances. "supabase" is wired once the real adapter exists.
 * Components never import adapters directly — always `getProvider()`.
 */

/**
 * Which DataProvider methods only read. Everything else persists the store
 * after it runs. Names, not a hand-kept list, so new mutators are covered
 * by default — forgetting to persist a new write method was exactly the
 * kind of silent bug this layer exists to prevent.
 */
function isReadOnlyMethod(name: string): boolean {
  return name.startsWith("get") || name.startsWith("count") || name === "resolveAudience";
}

/**
 * Wraps the mock provider so every public call syncs with the blob
 * snapshot. Uses `value.apply(target, …)` deliberately: internal `this.x()`
 * helper calls inside the mock stay unwrapped and synchronous — wrapping
 * those would turn boolean helpers into always-truthy Promises inside
 * `.filter(...)` and quietly break authorization checks.
 */
function withPersistence(provider: MockDataProvider): DataProvider {
  return new Proxy(provider, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return async (...args: unknown[]) => {
        await ensureMockStoreLoaded();
        const result = await (value as (...a: unknown[]) => unknown).apply(target, args);
        if (!isReadOnlyMethod(String(property))) {
          await persistMockStore();
        }
        return result;
      };
    },
  }) as unknown as DataProvider;
}

let cached: DataProvider | null = null;

export function getProvider(): DataProvider {
  if (cached) return cached;
  const mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "mock";
  if (mode === "supabase") {
    // Shared novapa-deh project (public schema). Ported methods hit
    // Postgres; unported ones throw loudly — never silent mock fallback
    // in a "real" deployment.
    cached = createSupabaseProvider();
    return cached;
  }
  cached = withPersistence(new MockDataProvider());
  return cached;
}

export { AccessDeniedError } from "./provider";
export type { DataProvider } from "./provider";
export * from "./types";
