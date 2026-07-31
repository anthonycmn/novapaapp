import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Hourly job, invoked by the Netlify scheduled function (or manually by
 * staff for testing):
 *  - re-notify families whose casting confirmation is still unanswered
 *    (every 12h per org policy)
 *  - 24h-before rehearsal reminders and post-rehearsal thank-yous
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
    const systemUser = await getProvider().getUserByEmail("dana@example.com");
    if (!systemUser) {
      return NextResponse.json({ error: "No job account" }, { status: 503 });
    }
    actorId = systemUser.id;
  }

  const confirmations = await getProvider().remindPendingCastingConfirmations(actorId!);
  const rehearsals = await getProvider().runRehearsalNotices(actorId!);
  return NextResponse.json({ ...confirmations, ...rehearsals });
}
