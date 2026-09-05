import { NextRequest, NextResponse } from "next/server";
import { drainPushQueue } from "@/lib/push/queue";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Drains the push outbox (hub 0068): unstamped notification rows become
 * pushes on every subscribed device. Invoked every 5 minutes by
 * netlify/functions/push-queue.mjs, or by staff for testing.
 *
 * Five minutes rather than fifteen because the latency-sensitive pushes
 * (message replies, feed posts) do not wait for this at all — their server
 * actions kick the drain inline. The cron exists for everything else, for
 * retries, and to release quiet-hours holds once morning comes.
 *
 * Unlike email-queue there is no job actor: the drain reads rows already
 * addressed to their accounts and decides nothing about audiences.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    const secret = process.env.CRON_SECRET;
    const presented = request.headers.get("x-cron-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const result = await drainPushQueue();
  return NextResponse.json(result);
}
