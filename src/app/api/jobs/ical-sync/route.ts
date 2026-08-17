import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { syncIcalFeeds } from "@/lib/api/ical-sync";

/**
 * The iCal bridge's trigger: pulls each configured show calendar into family
 * calendar events. Runs hourly via the Netlify scheduled function, and on
 * demand by staff who have just edited the calendar and don't want to wait.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    const secret = process.env.CRON_SECRET;
    const presented = request.headers.get("x-cron-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase") {
    return NextResponse.json({ skipped: "mock mode" });
  }

  try {
    return NextResponse.json(await syncIcalFeeds());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
