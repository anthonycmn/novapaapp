import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { OPT_OUT_CATEGORIES } from "@/lib/api/email/tracking";

/**
 * Email opt-outs, finally read by something.
 *
 * `email_preferences` shipped in migration 0003 with a CHECK preventing
 * critical-category opt-outs — and then nothing ever wrote or read a row
 * (Sep 5 2026 audit). This module is the read/write pair: the /unsubscribe
 * page writes, every delivery loop asks before sending.
 *
 * The unit is the FAMILY, not the address: a household that says "no
 * newsletters" means it however many guardian emails they have.
 */

export async function getOptedOutFamilies(category: string): Promise<Set<string>> {
  if (!OPT_OUT_CATEGORIES.has(category)) return new Set();
  if (!isSupabaseConfigured()) return new Set();
  try {
    const { data } = await getServiceClient()
      .from("email_preferences")
      .select("family_id")
      .eq("category", category)
      .eq("opted_out", true);
    return new Set(
      ((data ?? []) as Array<{ family_id: string }>).map((row) => String(row.family_id))
    );
  } catch {
    // An unreadable preference table must not block a send — but it also
    // must not unsubscribe anyone by accident, so the answer is "nobody".
    return new Set();
  }
}

export async function setEmailOptOut(
  familyId: string,
  category: string,
  optedOut: boolean
): Promise<boolean> {
  if (!OPT_OUT_CATEGORIES.has(category)) return false;
  if (!isSupabaseConfigured()) return false;
  const db = getServiceClient();
  const { error } = await db
    .from("email_preferences")
    .upsert({ family_id: familyId, category, opted_out: optedOut }, { onConflict: "family_id,category" });
  return !error;
}

/** Keep every recipient whose family has not opted out of this category. */
export function keepSubscribed<T extends { familyId?: string | null }>(
  recipients: T[],
  optedOut: Set<string>
): T[] {
  if (optedOut.size === 0) return recipients;
  return recipients.filter((r) => !r.familyId || !optedOut.has(r.familyId));
}

/**
 * The audience, minus the families who asked off the list — as one call.
 *
 * Every delivery path was hand-wiring resolveAudience + getOptedOutFamilies
 * + keepSubscribed, which is how the next path forgets one of the three and
 * a family who unsubscribed keeps getting newsletters. The two reads are
 * independent, so they run together.
 */
export async function resolveSubscribedAudience<
  R extends { familyId?: string | null },
  A,
>(
  provider: { resolveAudience(actorId: string, audience: A): Promise<R[]> },
  actorId: string,
  audience: A,
  category: string
): Promise<R[]> {
  const [recipients, optedOut] = await Promise.all([
    provider.resolveAudience(actorId, audience),
    getOptedOutFamilies(category),
  ]);
  return keepSubscribed(recipients, optedOut);
}
