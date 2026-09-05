import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runHealthFormReminders } from "@/lib/jobs/health-form-reminders";

/**
 * Daily job, invoked by the Netlify scheduled function (or manually by staff
 * for testing): nudge every family with an enrolled child whose season health
 * form is missing or expiring. Spacing and audience live in the job module.
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

  try {
    const result = await runHealthFormReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("health-form-reminders", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
