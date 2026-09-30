import { NextRequest, NextResponse } from "next/server";
import { welcomeFamily } from "@/lib/registration/front-door";

/**
 * Called by the registration webhook (novapawebsite reg-frontdoor.mjs) the
 * moment a front-door checkout is paid: make the family's portal account now,
 * email the welcome, and hand back a one-time sign-in link for the receipt.
 * See lib/registration/front-door.ts.
 *
 * Auth: the same shared secret as /api/registration/webhook, in the
 * X-Registration-Secret header, compared in constant time. The body names an
 * email and nothing else can be asked of this route, so the secret is what
 * stops anyone minting a sign-in link for an address they typed.
 */
export const runtime = "nodejs";
export const maxDuration = 26;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(request: NextRequest) {
  const expected = process.env.REGISTRATION_WEBHOOK_SECRET;
  if (!expected) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const presented = request.headers.get("x-registration-secret") ?? "";
  if (!timingSafeEqual(presented, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { email?: unknown; parent_name?: unknown; cart_id?: unknown }
    | null;
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Bad email" }, { status: 400 });
  }
  const cartId = /^[0-9a-f-]{36}$/i.test(String(body?.cart_id ?? "")) ? String(body?.cart_id) : null;

  try {
    const r = await welcomeFamily({ email, parentName: String(body?.parent_name ?? "").slice(0, 120), cartId });
    return NextResponse.json({ receipt_url: r.receiptUrl, welcome_sent: r.welcomeSent });
  } catch (e) {
    console.error("front door welcome failed:", e);
    // The family has paid regardless. 500 so the caller logs it; the
    // 15-minute sync still makes the account and "Forgot password" still works.
    return NextResponse.json({ error: "Welcome failed" }, { status: 500 });
  }
}
