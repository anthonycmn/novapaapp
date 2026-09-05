import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { syncPortalSchedule } from "@/lib/api/schedule-sync";
import { kickPushQueue } from "@/lib/push/queue";

/**
 * The schedule bridge's trigger: mirrors the staff portal's season plan
 * (rehearsals, tech, performances, camps, curriculum links) into family
 * calendar events. Runs hourly via the Netlify scheduled function and
 * on demand by staff.
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
    const result = await syncPortalSchedule();
    /* A rehearsal change should beat the drive to rehearsal: the sync just
       wrote its schedule_change rows, so ring them now rather than at the
       next push-queue tick (hub 0068). */
    await kickPushQueue();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
