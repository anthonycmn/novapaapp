import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";

/**
 * Guardian names for a set of recipients.
 *
 * The three delivery loops hold a `User`, which carries `display_name` and
 * nothing else about who the person is. For 176 of 815 parents that display
 * name is their email address, so the greeting needs the other source, and
 * `guardians.full_name` is it. See `@/lib/names` for the order the two
 * are tried in.
 *
 * Keyed on `guardians.user_id`, not on the address. Address is the obvious
 * key and the wrong one: nothing lowercases `guardians.email` on the way in
 * (every reader does it on the way out, see `provision.ts`), so an `in`
 * filter on addresses silently misses whichever rows were written with a
 * capital letter. `user_id` is the profile id the recipient already carries.
 * The Sep 21 2026 audit put unlinked guardian rows at zero of 892; a row
 * that is not linked yields no name here and the recipient falls back to
 * their display name, which is what happened before this existed.
 *
 * Read once for the whole audience rather than once per recipient: a
 * newsletter addresses hundreds of families.
 *
 * Degrades exactly like `getOptedOutFamilies`: an unreadable guardians table
 * must not block a send. An empty map means everyone falls back. Mock mode
 * has no service client and returns that same empty map; its seed profiles
 * carry real names already.
 */
export async function getGuardianNamesByUserId(
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const wanted = [...new Set(userIds.filter(Boolean))];
  if (wanted.length === 0 || !isSupabaseConfigured()) return new Map();
  try {
    const { data } = await getServiceClient()
      .from("guardians")
      .select("user_id, full_name")
      .in("user_id", wanted);
    const names = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ user_id: string; full_name: string }>) {
      const id = String(row.user_id ?? "");
      const fullName = String(row.full_name ?? "").trim();
      // First row wins. One login on two guardian rows is the duplicate-account
      // shape the registration audit tracks; either name is the same person.
      if (id && fullName && !names.has(id)) names.set(id, fullName);
    }
    return names;
  } catch {
    return new Map();
  }
}

/** The guardian name for one recipient, or null. */
export function guardianNameFor(
  names: Map<string, string>,
  userId: string | null | undefined
): string | null {
  return userId ? (names.get(userId) ?? null) : null;
}
