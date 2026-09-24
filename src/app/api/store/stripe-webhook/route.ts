import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { notifyCoachingPurchased } from "@/lib/api/coaching/notify";
import {
  completeCoachingPurchase,
  isCoachingReference,
} from "@/lib/api/coaching/shop";
import { recordCoachingPurchasePaid, recordStoreOrderPaid } from "@/lib/receipts/record";

/**
 * Stripe checkout webhook (#11). Marks an order paid once Stripe confirms.
 *
 * Signature verification follows Stripe's scheme: the Stripe-Signature header
 * carries a timestamp and one or more v1 HMAC-SHA256 signatures over
 * "{timestamp}.{raw body}", keyed with the endpoint secret. We compare in
 * constant time and reject stale timestamps to blunt replay attempts.
 *
 * ONE ENDPOINT, TWO KINDS OF PURCHASE. Coaching packages are sold here too,
 * and they arrive through this same endpoint rather than a second one, told
 * apart by their reference prefix: store orders are "NPA-", coaching is
 * "COACH-". A second endpoint would mean a second signing secret to create,
 * store and rotate, and a second chance to leave one half-configured — the
 * exact state `livePaymentsBlockedBecause` exists to guard against. Both
 * paths are idempotent, because Stripe retries.
 */

const TOLERANCE_SECONDS = 300;

function verify(rawBody: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(",").map((piece) => piece.split("=", 2) as [string, string])
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Raw body is required — parsing first would change the bytes we sign over.
  const rawBody = await request.text();
  const header = request.headers.get("stripe-signature") ?? "";

  if (!verify(rawBody, header, secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody) as {
    type: string;
    data: { object: { id: string; client_reference_id?: string; metadata?: Record<string, string> } };
  };

  if (event.type !== "checkout.session.completed") {
    // Acknowledge everything else so Stripe stops retrying.
    return NextResponse.json({ received: true });
  }

  const session = event.data.object;
  const reference = session.client_reference_id ?? session.metadata?.order_reference;
  if (!reference) {
    // Not ours. The account also sells through Stripe Payment Links (a $125
    // link on Sep 17 2026 was the first), and every Checkout Session on the
    // account lands here, reference or not. A 400 made Stripe retry the same
    // payment for three days and lit the endpoint red at 100% errors; there
    // is nothing to retry. Acknowledge it and let the registration side, or
    // Stripe itself, be the record.
    return NextResponse.json({ received: true, warning: "No order reference on session" });
  }

  if (isCoachingReference(reference)) {
    // Credits the family's session balance. Safe to run again: a retry
    // returns the package the first delivery already created.
    const result = await completeCoachingPurchase(reference, session.id);
    if (!result.ok) {
      // 200 regardless — a reference we will never resolve should not have
      // Stripe retrying it for days.
      return NextResponse.json({ received: true, warning: result.reason });
    }
    /*
     * The receipt, and the office's copy.
     *
     * Only on the FIRST delivery. Stripe retries, and a family who is emailed
     * "thank you, your sessions are ready" three times reasonably wonders
     * whether they were charged three times. `alreadyPaid` is how 0154 tells
     * a retry from the real thing, so it is what gates the send.
     *
     * Awaited, so it actually happens before this function is frozen, and
     * incapable of failing the webhook: a receipt that did not send is not a
     * reason for Stripe to redeliver a payment that succeeded.
     */
    if (!result.alreadyPaid) await notifyCoachingPurchased(reference);
    // The sale email to CJ and Todd and the Family Vault receipt (24 Sep
    // 2026). Not gated on alreadyPaid: it is idempotent on its own, so a
    // retry after a first delivery that failed to file still files.
    await recordCoachingPurchasePaid(reference);

    return NextResponse.json({
      received: true,
      coaching: reference,
      alreadyPaid: result.alreadyPaid ?? false,
    });
  }

  const order = await getProvider().markOrderPaid(reference, session.id);
  if (!order) {
    // 200 so Stripe doesn't retry forever over an order we'll never find.
    return NextResponse.json({ received: true, warning: "Unknown order reference" });
  }

  // CJ and Todd's sale email, the family's confirmation, and the receipt in
  // the Family Vault. Once per order however often Stripe retries, and never
  // able to fail this response — see src/lib/receipts/record.ts.
  await recordStoreOrderPaid(order);

  return NextResponse.json({ received: true, order: order.reference });
}
