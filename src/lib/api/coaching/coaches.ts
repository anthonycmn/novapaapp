import type { StaffProfile } from "../types";
import { getPortalReadClient, isSupabaseConfigured } from "../supabase/client";
import { assembleCoaches, type Coach, type OfferedCoach } from "./assemble";

export type { Coach } from "./assemble";

/**
 * Reading the staff portal's half of a coach.
 *
 * The rule that decides who a family sees lives in `./assemble`, deliberately
 * free of any server-only import so it can be tested. This module is only the
 * fetch, and its one job beyond that is to fail quietly.
 */

/**
 * Who the portal is offering, in the order it wants them.
 *
 * Returns an empty list if the view is unreachable, which degrades to "no
 * coaches are on offer" rather than an error page. That is the same choice
 * `fetchCoachingActivityIds` makes about the same bridge, and it is the right
 * one: the staff portal being down must not take a family's portal down too.
 */
async function fetchOfferedCoaches(): Promise<OfferedCoach[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getPortalReadClient()
      .from("v_coaching_coaches_public")
      .select(
        "staff_id, slug, name, headline, video_url, accepting_new, sort_order, disciplines"
      );
    if (error) throw error;
    return (data ?? []).map((row) => {
      const sortOrder = (row as { sort_order?: unknown }).sort_order;
      return {
        row: row as OfferedCoach["row"],
        sortOrder: typeof sortOrder === "number" ? sortOrder : 100,
      };
    });
  } catch {
    return [];
  }
}

/** Every bookable coach, both halves joined. */
export async function getCoaches(profiles: StaffProfile[]): Promise<Coach[]> {
  return assembleCoaches(await fetchOfferedCoaches(), profiles);
}

/** One coach by their web address, or null if they are not on offer. */
export async function getCoachBySlug(
  slug: string,
  profiles: StaffProfile[]
): Promise<Coach | null> {
  const coaches = await getCoaches(profiles);
  return coaches.find((coach) => coach.slug === slug) ?? null;
}
