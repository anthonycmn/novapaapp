import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getRegistrationProvider } from "@/lib/api/registration";
import { jobActorId } from "@/lib/jobs/actor";

/**
 * Inbound sync trigger (#8). The registration system (or a Zapier zap in
 * front of it) POSTs here when an enrollment or payment changes; we then pull
 * a fresh snapshot rather than trusting the request body. Pull-on-notify
 * keeps one code path for webhook and manual syncs, and means a spoofed or
 * malformed payload can't write anything.
 *
 * Auth: shared secret in the X-Registration-Secret header, compared in
 * constant time. Set REGISTRATION_WEBHOOK_SECRET in the environment.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env.REGISTRATION_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 }
    );
  }

  const presented = request.headers.get("x-registration-secret") ?? "";
  if (!timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = getProvider();
  const registration = getRegistrationProvider();

  // Webhooks run without a user session; attribute to the job account. This
  // was dana@example.com — a seed address with no production profile — so
  // every real webhook call died here with a 503, the same dead-address
  // failure the email queue once had. See lib/jobs/actor.ts.
  const systemUserId = await jobActorId();
  if (!systemUserId) {
    return NextResponse.json({ error: "No sync account configured" }, { status: 503 });
  }

  try {
    const snapshot = await registration.fetchSnapshot();
    const run = await provider.syncRegistration(systemUserId, snapshot, "webhook");
    return NextResponse.json({
      status: run.status,
      counts: run.counts,
      issues: run.issues.length,
    });
  } catch (error) {
    const message = String(error);
    await provider.recordSyncFailure(
      systemUserId,
      registration.source,
      "webhook",
      message
    );
    // 200 so the sender doesn't retry-storm; the failure is visible in-app.
    return NextResponse.json({ status: "failed", error: message });
  }
}
