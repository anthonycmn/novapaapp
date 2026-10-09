import "server-only";
import { EncoreService } from "./service";
import { MockEncoreRepo } from "./repo-mock";
import { SupabaseEncoreRepo } from "./repo-supabase";

let cached: EncoreService | null = null;

/** Encore Points for the current data mode, the same switch getProvider() uses. */
export function getEncore(): EncoreService {
  if (cached) return cached;
  const live = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  cached = new EncoreService(live ? new SupabaseEncoreRepo() : new MockEncoreRepo());
  return cached;
}

export type { EncorePage, EncoreSummary } from "./service";
