import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runResetSmoke } from "@/lib/jobs/reset-smoke";

/**
 * "Can a parent get in?" — asked of the live portal after every production
 * deploy (netlify/plugins/reset-smoke) and every six hours
 * (netlify/functions/reset-smoke). Staff can run it by hand; the cron secret
 * is for the machines. `?notify=1` emails the report even when it passes;
 * `?base=` points it at another deploy of this app (a preview, say).
 * The job module says what it checks and why.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

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
  const base = params.get("base") ?? undefined;
  const notify = params.get("notify") === "1";

  try {
    const result = await runResetSmoke({ base, notify });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error("reset-smoke", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
