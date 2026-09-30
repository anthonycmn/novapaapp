"use server";

import { registration } from "@/config/registration";
import { getWebsiteAnonClient } from "@/lib/api/supabase/client";
import { TERMS_VERSION } from "./terms";

/**
 * The server half of /register (CJ, 30 Sep 2026): registration inside the
 * parent portal, in novapa.org's look, replacing novapa.org/register.
 *
 * Nothing here prices or charges anything itself. It is the same guest
 * checkout the website runs — acquire_hold_guest, then reg-pay — called
 * server to server (reg-pay has no CORS, and the portal holds no Stripe
 * secret). Every rule about seats, the gate, prices, coupons and Stripe stays
 * in the registration system, where it is tested.
 *
 * One cart, two parts. A class is a monthly subscription and everything else
 * is a one-off or a plan, so reg-pay takes them as two holds. The family types
 * the card once, for the first part; the second part names the first
 * payment and is charged to the card it saved (reg-pay pay_with_intent).
 */

export interface CartLine {
  activityId: number;
  isClass: boolean;
  camper: string;
  /** The student's position in the family list, so two same-named children never merge. */
  ci: number;
}

export interface Holds {
  classHold: string | null;
  otherHold: string | null;
  expiresAt: string | null;
}

export type Plan = "full" | "deposit" | "subscription";

export interface PartPricing {
  today_cents: number;
  total_cents: number;
  subtotal_cents: number;
  coupon_cents: number;
  coupon: string | null;
  plan_fee_cents: number;
  insurance_cents: number;
  installment_cents: number;
  n_installments: number;
  first_installment_utc: number;
  monthly_cents: number;
  unit_prices: number[];
  class_month?: string;
  next_bill_utc?: number;
  cancel_at_utc?: number;
  first_class_free?: boolean;
}

export interface PartAnswer {
  ok: boolean;
  error?: string;
  message?: string;
  pricing?: PartPricing;
  free?: boolean;
  clientSecret?: string;
  setup?: boolean;
  enrolled?: boolean;
  confirmed?: boolean;
  description?: string;
}

export interface Family {
  email: string;
  parentName: string;
  phone: string;
  smsConsent: boolean;
  /** Student name → YYYY-MM-DD, so the registration rows are born complete. */
  bdays: Record<string, string>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Words a parent can act on, for the refusals the hold and checkout can give. */
function friendly(code: string | undefined, fallback?: string): string {
  const c = code ?? "";
  if (/SOLD_OUT/.test(c)) return "Something in your cart just filled up. Remove it or join its waitlist, then try again.";
  if (/GATED/.test(c)) return "One of these is open to returning families first. Use the email you registered with before.";
  if (c === "hold_expired" || c === "hold_not_found") return "Your spots were held for 30 minutes and the time ran out. Press Review again to hold them.";
  if (c === "bad_coupon") return "That code isn't valid.";
  if (c === "coupon_too_small") return "That code takes the total below the minimum card charge. Contact the office and we'll sort it.";
  if (c === "pay_full_only") return "It starts too soon for a payment plan, so it can only be paid in full.";
  if (c === "plan_required") return "One of these has to be paid on the payment plan.";
  if (c === "registration_closed") return "Registration for one of these has closed.";
  if (c === "card_declined") return "The card was declined. Try another card.";
  if (c === "card_needs_action") return "Your bank wants to confirm the class payment. Press Pay again to finish it.";
  if (c === "saved_card_unavailable") return "We couldn't reuse your card for the class part. Press Pay again to finish it.";
  return fallback ?? "Something went wrong on our side. Nothing was charged. Please try again, or email info@novapa.org.";
}

/** Hold the seats: one hold, or two (classes | the rest) taken together. */
export async function holdCart(email: string, lines: CartLine[]): Promise<{ ok: boolean; message?: string; holds?: Holds }> {
  const address = email.trim().toLowerCase();
  if (!EMAIL.test(address)) return { ok: false, message: "Please enter a valid email address." };
  if (!lines.length || lines.length > 12) return { ok: false, message: "Your cart needs between 1 and 12 things in it." };
  const item = (l: CartLine) => ({ activity_id: l.activityId, camper: l.camper.trim(), ci: l.ci });
  const classes = lines.filter((l) => l.isClass).map(item);
  const others = lines.filter((l) => !l.isClass).map(item);
  const db = getWebsiteAnonClient();
  try {
    if (classes.length && others.length) {
      const { data, error } = await db.rpc("acquire_hold_guest_split", {
        p_class_items: classes, p_other_items: others, p_email: address,
      });
      if (error) return { ok: false, message: friendly(error.message) };
      const d = data as { class: { hold_id: string; expires_at: string }; other: { hold_id: string } };
      return { ok: true, holds: { classHold: d.class.hold_id, otherHold: d.other.hold_id, expiresAt: d.class.expires_at } };
    }
    const { data, error } = await db.rpc("acquire_hold_guest", { p_items: classes.length ? classes : others, p_email: address });
    if (error) return { ok: false, message: friendly(error.message) };
    const d = data as { hold_id: string; expires_at: string };
    return {
      ok: true,
      holds: {
        classHold: classes.length ? d.hold_id : null,
        otherHold: classes.length ? null : d.hold_id,
        expiresAt: d.expires_at,
      },
    };
  } catch {
    return { ok: false, message: friendly(undefined) };
  }
}

/**
 * One call to reg-pay for one part. `quote` asks for the numbers only;
 * without it this makes the Stripe intent (or, with payWithIntent, charges the
 * saved card). The body is exactly what the website's own checkout sends,
 * plus the front door's keys.
 */
export async function checkoutPart(input: {
  holdId: string;
  plan: Plan;
  family: Family;
  insurance: boolean;
  coupon: string;
  cartId: string;
  quote?: boolean;
  saveCard?: boolean;
  payWithIntent?: string;
  confirmFree?: boolean;
  ref?: string;
}): Promise<PartAnswer> {
  const f = input.family;
  if (!EMAIL.test(f.email.trim())) return { ok: false, message: "Please enter a valid email address." };
  const body: Record<string, unknown> = {
    hold_id: input.holdId,
    plan: input.plan,
    email: f.email.trim().toLowerCase(),
    parent_name: f.parentName.trim() || undefined,
    phone: f.phone.trim() || undefined,
    sms_consent: f.smsConsent,
    bdays: f.bdays,
    insurance: input.insurance,
    coupon: input.coupon.trim() || undefined,
    cart_id: input.cartId,
    front_door: "portal",
    terms_version: TERMS_VERSION,
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.quote ? { quote_only: true } : {}),
    ...(input.saveCard ? { save_card: true } : {}),
    ...(input.payWithIntent ? { pay_with_intent: input.payWithIntent } : {}),
    ...(input.confirmFree ? { confirm_free: true } : {}),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), registration.regPayTimeoutMs);
  try {
    const res = await fetch(registration.regPayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !j) {
      const code = typeof j?.error === "string" ? j.error : `HTTP ${res.status}`;
      return { ok: false, error: code, message: friendly(code) };
    }
    return {
      ok: true,
      pricing: j.pricing as PartPricing | undefined,
      free: j.free === true,
      clientSecret: typeof j.client_secret === "string" ? j.client_secret : undefined,
      setup: j.setup === true,
      enrolled: j.enrolled === true,
      confirmed: j.confirmed === true,
      description: typeof j.description === "string" ? j.description : undefined,
    };
  } catch {
    return { ok: false, error: "network", message: friendly(undefined) };
  } finally {
    clearTimeout(timer);
  }
}

/** Join a full listing's waitlist, through the website's own endpoint. */
export async function joinWaitlist(input: {
  activityId: number;
  camperName: string;
  parentName: string;
  email: string;
}): Promise<{ ok: boolean; message: string; open?: boolean }> {
  if (!EMAIL.test(input.email.trim()) || !input.camperName.trim()) {
    return { ok: false, message: "Add the student's name and your email." };
  }
  const url = registration.regPayUrl.replace(/reg-pay$/, "reg-waitlist");
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        activity_id: input.activityId,
        camper_name: input.camperName.trim(),
        parent_name: input.parentName.trim(),
        email: input.email.trim().toLowerCase(),
      }),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; already?: boolean; open?: boolean } | null;
    if (j?.open) return { ok: true, open: true, message: "A spot just opened up — add it to your cart now." };
    if (res.ok && j?.ok) {
      return {
        ok: true,
        message: j.already ? "You're already on the waitlist. We'll email you if a spot opens." : "You're on the waitlist. We'll email you if a spot opens.",
      };
    }
    return { ok: false, message: "We couldn't add you to the waitlist. Please email info@novapa.org." };
  } catch {
    return { ok: false, message: "We couldn't add you to the waitlist. Please email info@novapa.org." };
  }
}
