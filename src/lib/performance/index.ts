import "server-only";
import { PerformanceService } from "./service";
import { MockPerformanceRepo } from "./repo-mock";
import { SupabasePerformanceRepo } from "./repo-supabase";

let cached: PerformanceService | null = null;

/** Performance Events for the current data mode, the same switch getProvider() uses. */
export function getPerformance(): PerformanceService {
  if (cached) return cached;
  const live = (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";
  cached = new PerformanceService(live ? new SupabasePerformanceRepo() : new MockPerformanceRepo());
  return cached;
}

export type { EventCard, EventPage, ActPage } from "./service";
