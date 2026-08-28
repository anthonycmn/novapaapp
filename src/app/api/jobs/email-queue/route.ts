import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getServiceClient } from "@/lib/api/supabase/client";
import { runEmailQueue } from "@/lib/email/queue";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Delivers scheduled email whose time has come. Invoked every 15 minutes by
 * netlify/functions/email-queue.mjs, or by staff for testing.
 *
 * Fifteen minutes rather than hourly because these are call sheets: a send
 * set for 9:00 AM that lands at 9:59 is a different message to a parent
 * deciding whether to leave the house.
 */

/**
 * Whose permissions the job resolves audiences with.
 *
 * THIS USED TO BE dana@example.com, HARDCODED, and there is no such profile —
 * 789 profiles in production and not one of them is Dana. So every cron run
 * returned 503 "No job account" and nothing scheduled has ever been delivered.
 * The failure is invisible from the composer: the row is written, scheduled_for
 * passes, and it simply sits there. A seed address survived into production and
 * quietly turned the queue off.
 *
 * The actor is only ever passed to resolveAudience, which wants somebody
 * allowed to read the family list — not an author. The send carries its own
 * created_by_name for the signature, so this decides nothing a parent sees.
 *
 * EMAIL_QUEUE_ACTOR_EMAIL overrides it when somebody wants a named service
 * account. Without one, the lowest-numbered super_admin is used, because a
 * super_admin is the one role certain to be allowed to see every family — and
 * an ordering makes the choice stable rather than whatever Postgres returns
 * first today.
 */
async function jobActorId(): Promise<string | null> {
  const named = process.env.EMAIL_QUEUE_ACTOR_EMAIL?.trim();
  if (named) {
    const user = await getProvider().getUserByEmail(named);
    if (user) return user.id;
  }
  const { data } = await getServiceClient()
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .order("id")
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}
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
        { error: "No job account: no super_admin profile, and EMAIL_QUEUE_ACTOR_EMAIL is unset." },
        { status: 503 }
      );
    }
    actorId = systemActor;
  }

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    request.headers.get("origin") ??
    `https://${request.headers.get("host") ?? "portal.novapa.org"}`;

  const result = await runEmailQueue(getProvider(), actorId!, origin);
  return NextResponse.json(result);
}
