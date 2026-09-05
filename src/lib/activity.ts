import "server-only";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { currentImpersonation } from "@/lib/auth/impersonation";

/**
 * The play-by-play (hub 0065): one line per thing a family did, written by
 * the server action that did it, read only by the Chief in the staff portal.
 *
 * TWO RULES, AND EVERY CALL SITE KEEPS BOTH.
 *
 * 1. AFTER THE WRITE, NEVER INSTEAD OF IT. The log describes something that
 *    happened, so it is only ever called once the provider call has succeeded.
 *    An action that failed writes no line.
 *
 * 2. THE LOG CAN NEVER FAIL THE ACTION. Everything here is swallowed. A
 *    parent whose absence report saved must not be shown an error because the
 *    note about it could not be filed — the same bargain notifySubmission and
 *    append_impersonation_block already keep.
 *
 * The summary is a sentence WITHOUT the actor's name in front — the reader
 * prepends "Sarah Miller (Miller family)" from the columns, so the phrasing
 * stays consistent however the actor is displayed. Keep summaries free of
 * medical detail: "Signed the health form for Elsie" is the play; the answers
 * stay behind the health desk's own gate.
 */

type ActivityActor = {
  id?: string;
  email?: string;
  displayName?: string;
  role?: string;
  familyId?: string;
  family?: { name?: string };
} | null;

export async function logActivity(input: {
  /** The signed-in user, straight from getSessionUser(). */
  user?: ActivityActor;
  /** For the moments with no session yet: signup, password reset. */
  actorEmail?: string;
  /** Stable dotted slug, e.g. 'absence.reported'. */
  action: string;
  /** The sentence, actor's name not included. */
  summary: string;
  studentId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  // Mock mode has no service client and no Chief to read it.
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase") return;
  if (!isSupabaseConfigured()) return;

  try {
    // A Chief in the family's shoes (hub 0063) is stamped on the line, so it
    // can never read as the parent's own doing. Best-effort like the rest.
    const impersonation = await currentImpersonation().catch(() => null);

    const user = input.user ?? null;
    await getServiceClient()
      .from("activity_log")
      .insert({
        actor_user_id: user?.id ?? null,
        actor_name: user?.displayName ?? null,
        actor_email: user?.email ?? input.actorEmail ?? null,
        actor_role: user?.role ?? null,
        family_id: user?.familyId ?? null,
        family_name: user?.family?.name ?? null,
        student_id: input.studentId ?? null,
        action: input.action,
        summary: input.summary,
        detail: input.detail ?? {},
        impersonator_email: impersonation?.actorEmail ?? null,
      });
  } catch {
    /* Rule 2. The action already happened; the log is the bonus. */
  }
}
