import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { getEncore } from "@/lib/encore";
import { recordStripeReversals } from "@/lib/encore/stripe-reversals";

/**
 * Encore Points earning (hub 0098), hourly from
 * netlify/functions/encore-sync.mjs, or by staff for testing.
 *
 * ep_sync() earns points for every payment not yet in the ledger, oldest
 * first, and is idempotent: each ledger row carries its payment's reference.
 * Before CJ launches the program it only earns for his preview families and
 * otherwise does nothing.
 *
 * First it records every Stripe refund and chargeback since earning began
 * (hub 0099), so ep_sync() can take their points back in the same run. That
 * step runs before launch too: the refunds wait in ep_reversals and land at
 * launch together with the back-dated earning. A Stripe failure is logged
 * and never stops earning.
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
    const encore = getEncore();
    let refunds: Record<string, unknown> = { skipped: "mock" };
    if (encore.mode === "live") {
      refunds = await recordStripeReversals().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("encore-sync refunds:", message);
        return { error: message };
      });
    }
    const result = await encore.sync();
    return NextResponse.json({ ok: true, refunds, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("encore-sync:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
