import "server-only";
import { getServiceClient, getWebsiteReadClient } from "@/lib/api/supabase/client";

/**
 * Refunds and chargebacks for Encore Points (hub 0099). CJ, 10 Oct 2026:
 * "make sure that when money is refunded, or something is canceled those
 * points are removed."
 *
 * Refunds live only in Stripe: no NOVAPA table records one. So the hourly
 * encore-sync job reads every refund and dispute since the season's earning
 * start from the Stripe API and records each new one with
 * family_hub.ep_record_reversal(), naming the purchase it came off. ep_sync()
 * then takes the points back. Recording is idempotent (the refund id is the
 * key), so reading the whole season every hour is safe; the season holds a
 * few hundred refunds at most.
 *
 * One Stripe account serves registration, BookTix and this store. The API
 * version is pinned so a charge still carries its invoice (a payment-plan or
 * monthly class pull), whatever the account's default version becomes.
 */

const STRIPE_VERSION = "2024-06-20";

type StripeCharge = {
  id: string;
  payment_intent?: string | null;
  invoice?: string | null;
  amount: number;
  billing_details?: { email?: string | null };
};
type StripeRefund = {
  id: string;
  amount: number;
  status: string;
  created: number;
  reason?: string | null;
  metadata?: Record<string, string>;
  charge: StripeCharge | string | null;
};
type StripeDispute = {
  id: string;
  amount: number;
  status: string;
  created: number;
  reason?: string | null;
  charge: StripeCharge | string | null;
};

async function stripeGet<T>(key: string, path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`https://api.stripe.com/v1/${path}?${qs}`, {
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION },
  });
  if (!res.ok) throw new Error(`Stripe ${path} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

async function listAll<T extends { id: string }>(key: string, path: string, since: number): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < 50; page++) {
    const params: Record<string, string> = { limit: "100", "created[gte]": String(since), "expand[]": "data.charge" };
    if (after) params.starting_after = after;
    const res = await stripeGet<{ data: T[]; has_more: boolean }>(key, path, params);
    out.push(...res.data);
    if (!res.has_more || res.data.length === 0) break;
    after = res.data[res.data.length - 1].id;
  }
  return out;
}

/** The purchase a charge paid for: a registration order, a BookTix order or a store order. */
async function purchaseFor(key: string, charge: StripeCharge): Promise<{ orderId?: string; sourceRef?: string }> {
  const pub = getWebsiteReadClient();
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : undefined;
  if (pi) {
    const { data } = await pub.from("orders").select("id").eq("stripe_payment_intent", pi).limit(1);
    if (data?.[0]) return { orderId: String(data[0].id) };
  }
  if (charge.invoice) {
    const { data } = await pub.from("order_installments").select("order_id").eq("stripe_invoice", charge.invoice).limit(1);
    if (data?.[0]) return { orderId: String(data[0].order_id) };
  }
  if (pi) {
    const { data } = await pub.from("tix_orders").select("id").eq("stripe_payment_intent", pi).limit(1);
    if (data?.[0]) return { sourceRef: `tix:${data[0].id}` };
    const sessions = await stripeGet<{ data: { id: string }[] }>(key, "checkout/sessions", { payment_intent: pi, limit: "1" });
    const session = sessions.data[0]?.id;
    if (session) {
      const { data: store } = await getServiceClient()
        .from("button_orders").select("id").eq("payment_ref", session).limit(1);
      if (store?.[0]) return { sourceRef: `store:${store[0].id}` };
    }
  }
  return {};
}

export async function recordStripeReversals(): Promise<{ recorded: number; seen: number } | { skipped: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { skipped: "no STRIPE_SECRET_KEY" };
  const db = getServiceClient();
  const { data: program } = await db.from("ep_program").select("earn_from").eq("id", 1).maybeSingle();
  if (!program) return { skipped: "Encore Points is not installed (hub 0098)" };
  // Midnight on the earning start in New York (EDT in September).
  const since = Math.floor(new Date(`${program.earn_from}T04:00:00Z`).getTime() / 1000);

  const { data: knownRows, error } = await db.from("ep_reversals").select("ref");
  if (error) return { skipped: `ep_reversals unreadable (hub 0099?): ${error.message}` };
  const known = new Set((knownRows ?? []).map((r: { ref: string }) => r.ref));

  const [refunds, disputes] = await Promise.all([
    listAll<StripeRefund>(key, "refunds", since),
    listAll<StripeDispute>(key, "disputes", since),
  ]);

  let recorded = 0;
  const record = async (
    ref: string,
    kind: "refund" | "dispute",
    amount: number,
    created: number,
    charge: StripeCharge | string | null,
    detail: Record<string, unknown>
  ) => {
    if (known.has(ref) || typeof charge !== "object" || !charge) return;
    const target = await purchaseFor(key, charge);
    const { error: rpcError } = await db.rpc("ep_record_reversal", {
      p_ref: ref,
      p_kind: kind,
      p_order_id: target.orderId ?? null,
      p_source_ref: target.sourceRef ?? null,
      p_cents: amount,
      p_at: new Date(created * 1000).toISOString(),
      p_detail: { ...detail, charge: charge.id, payment_intent: charge.payment_intent ?? null, email: charge.billing_details?.email ?? null },
    });
    if (rpcError) throw new Error(`ep_record_reversal ${ref}: ${rpcError.message}`);
    recorded += 1;
  };

  for (const r of refunds) {
    if (r.status === "failed" || r.status === "canceled") continue;
    await record(`refund:${r.id}`, "refund", r.amount, r.created, r.charge, {
      refund: r.id,
      reason: r.reason ?? null,
      // Set by the website's cancel-a-seat; that cancellation takes the points back itself.
      item_id: r.metadata?.item_id ?? null,
    });
  }
  for (const d of disputes) {
    await record(`dispute:${d.id}`, "dispute", d.amount, d.created, d.charge, { dispute: d.id, reason: d.reason ?? null, status: d.status });
  }
  return { recorded, seen: refunds.length + disputes.length };
}
