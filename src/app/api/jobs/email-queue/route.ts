import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
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

  const origin =
    process.env.NEXT_PUBLIC_SITE_URL ??
    request.headers.get("origin") ??
    `https://${request.headers.get("host") ?? "portal.novapa.org"}`;

  const result = await runEmailQueue(getProvider(), actorId!, origin);
  return NextResponse.json(result);
}
