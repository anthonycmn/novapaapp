import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { getEncore } from "@/lib/encore";

/**
 * Encore Points earning (hub 0098), hourly from
 * netlify/functions/encore-sync.mjs, or by staff for testing.
 *
 * ep_sync() earns points for every payment not yet in the ledger, oldest
 * first, and is idempotent: each ledger row carries its payment's reference.
 * Before CJ launches the program it only earns for his preview families and
 * otherwise does nothing.
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
    const result = await getEncore().sync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("encore-sync:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
