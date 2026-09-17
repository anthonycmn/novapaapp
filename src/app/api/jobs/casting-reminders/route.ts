import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { jobActorId } from "@/lib/jobs/actor";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Hourly job, invoked by the Netlify scheduled function (or manually by
 * staff for testing):
 *  - re-notify families whose casting confirmation is still unanswered
 *    (every 12h per org policy)
 *  - 24h-before rehearsal reminders and post-rehearsal thank-yous
 *
 * THIS NEVER RAN IN PRODUCTION until 17 Sep 2026. The unattended path looked
 * up dana@example.com — a seed address with no profile — so every hourly tick
 * answered 503 "No job account" and nothing was reminded: Sweeney Todd's six
 * unanswered playbill names sat three weeks with reminder_count 0, and no
 * family ever got a rehearsal notice. The email queue and the registration
 * webhook died the same way and were fixed the same way; this one was missed.
 * jobActorId() is the shared answer: JOB_ACTOR_EMAIL, else a super_admin.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  let actorId = user?.id;

  if (!user || !hasRoleAtLeast(user, "staff")) {
    const secret = process.env.CRON_SECRET;
    const presented = request.headers.get("x-cron-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const systemActor = await jobActorId();
    if (!systemActor) {
      return NextResponse.json(
        { error: "No job account: no super_admin profile, and JOB_ACTOR_EMAIL is unset." },
        { status: 503 }
      );
    }
    actorId = systemActor;
  }

  const confirmations = await getProvider().remindPendingCastingConfirmations(actorId!);
  const rehearsals = await getProvider().runRehearsalNotices(actorId!);
  return NextResponse.json({ ...confirmations, ...rehearsals });
}
