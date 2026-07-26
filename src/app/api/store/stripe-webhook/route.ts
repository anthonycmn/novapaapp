import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";

/**
 * Stripe checkout webhook (#11). Marks an order paid once Stripe confirms.
 *
 * Signature verification follows Stripe's scheme: the Stripe-Signature header
 * carries a timestamp and one or more v1 HMAC-SHA256 signatures over
 * "{timestamp}.{raw body}", keyed with the endpoint secret. We compare in
 * constant time and reject stale timestamps to blunt replay attempts.
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
    return NextResponse.json({ error: "No order reference on session" }, { status: 400 });
  }

  const order = await getProvider().markOrderPaid(reference, session.id);
  if (!order) {
    // 200 so Stripe doesn't retry forever over an order we'll never find.
    return NextResponse.json({ received: true, warning: "Unknown order reference" });
  }

  return NextResponse.json({ received: true, order: order.reference });
}
