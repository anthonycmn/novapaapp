import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { resendAuditionReceipts } from "@/lib/jobs/resend-audition-receipts";

/**
 * Send the audition receipts that never left the building (13 Sep 2026 —
 * the site had no mail key). Staff session or the cron secret. `?dry=1`
 * lists without sending; `?since=<ISO>` moves the window (default 10 Sep).
 * Idempotent: a child+show already receipted this way is skipped. The job
 * module says why it exists.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    const secret = process.env.CRON_SECRET;
    const presented = request.headers.get("x-cron-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }
  const params = request.nextUrl.searchParams;
  try {
    const result = await resendAuditionReceipts({
      dry: params.get("dry") === "1",
      since: params.get("since") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("resend-audition-receipts", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
