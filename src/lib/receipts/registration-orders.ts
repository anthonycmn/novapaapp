import "server-only";
import { DAY_CAMP_PACK_IDS } from "@/config/day-camps";
import { getServiceClient, getWebsiteReadClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import {
  dayCampPurchaseFromOrder,
  isDayCampItem,
  isFreeOrder,
  receiptReference,
  type ActivityFacts,
  type WebsiteOrderItemRow,
  type WebsiteOrderRow,
} from "./day-camp-order";
import { recordPortalPurchase, refileReceipt } from "./record";

/**
 * Receipts for day camp orders placed on novapa.org.
 *
 * CJ, 24 Sep 2026: "cover the novapa.org day camp purchases too." The website
 * owns the checkout and already emails the office list (CJ and Todd among
 * them) and the family about every order, the $0 credit ones included. What
 * it could not do is put a receipt in the Family Vault, because the vault is
 * the hub's. So the hub reads the order, read-only, and files the receipt
 * itself: notify off, since every email this sale deserves has already gone.
 *
 * Run by the 15-minute registration sync over a short lookback, and directly
 * by the portal's own credit booking so its receipt is there before the
 * confirmation line says so. The vault row is the "already filed" marker, so
 * the two meeting on one order file it once.
 */

/** Receipts start with the deploy that introduced them; older orders are a backfill. */
export const DAY_CAMP_RECEIPTS_START = "2026-09-24T19:45:00Z";

/** How far back a scheduled run looks. Wide enough to ride out a day of failed syncs. */
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export interface DayCampReceiptRun {
  /** Day camp orders looked at. A dry run lists what it would file under `filed`. */
  orders: number;
  filed: string[];
  alreadyFiled: number;
  /** Orders whose family has no parent portal account: nowhere to file. */
  noFamily: string[];
  /** Orders whose address resolves to more than one portal family. */
  ambiguous: string[];
  failed: string[];
}

type Row = Record<string, unknown>;

/** The portal family behind a checkout address: website family by email or cc alias, then the link. */
async function hubFamilyFor(email: string): Promise<{ id: string; name: string | null } | "none" | "ambiguous"> {
  const address = email.trim().toLowerCase().replace(/[,()]/g, "");
  if (!address) return "none";
  const { data: families } = await getWebsiteReadClient()
    .from("families")
    .select("id")
    .or(`email.ilike.${address},cc_email.ilike.${address}`);
  const externalIds = (families ?? []).map((f: Row) => String(f.id));
  if (!externalIds.length) return "none";

  const hub = getServiceClient();
  const { data: links } = await hub
    .from("registration_account_links")
    .select("family_id")
    .eq("source", "website")
    .in("external_id", externalIds);
  const familyIds = [...new Set((links ?? []).map((l: Row) => String(l.family_id)))];
  if (familyIds.length === 0) return "none";
  if (familyIds.length > 1) return "ambiguous";

  const { data: family } = await hub.from("families").select("name").eq("id", familyIds[0]).maybeSingle();
  return { id: familyIds[0], name: (family as { name?: string } | null)?.name ?? null };
}

async function creditsRedeemed(paymentIntent: string): Promise<number | null> {
  const { data } = await getWebsiteReadClient()
    .from("credit_events")
    .select("detail")
    .eq("payment_intent", paymentIntent)
    .maybeSingle();
  const redemptions = (data as { detail?: { redemptions?: { day?: number; snow?: number }[] } } | null)?.detail?.redemptions;
  if (!redemptions) return null;
  return redemptions.reduce((n, r) => n + (Number(r.day) || 0) + (Number(r.snow) || 0), 0);
}

/**
 * File receipts for day camp orders: those placed since `since`, or exactly
 * `orderIds`. Never throws; a run that could not read the website comes back
 * with everything empty and the reason logged.
 */
export async function fileDayCampOrderReceipts(
  options: { since?: string; orderIds?: string[]; dryRun?: boolean; refile?: boolean } = {}
): Promise<DayCampReceiptRun> {
  const run: DayCampReceiptRun = { orders: 0, filed: [], alreadyFiled: 0, noFamily: [], ambiguous: [], failed: [] };
  if (!isSupabaseConfigured() || (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase") return run;

  try {
    const web = getWebsiteReadClient();
    let query = web
      .from("orders")
      .select(
        "id, order_no, email, parent_name, status, total_cents, amount_today_cents, installments_paid_cents, stripe_payment_intent, created_at, items:order_items(camper_name, unit_price_cents, activity_id)"
      )
      .eq("status", "paid")
      .order("created_at");
    if (options.orderIds?.length) query = query.in("id", options.orderIds);
    else {
      const floor = Math.max(Date.parse(DAY_CAMP_RECEIPTS_START), Date.now() - LOOKBACK_MS);
      const since = options.since ?? new Date(floor).toISOString();
      query = query.gte("created_at", since);
    }
    const { data: orders, error } = await query.range(0, 499);
    if (error) throw new Error(error.message);

    const rows = (orders ?? []) as unknown as (WebsiteOrderRow & { items: WebsiteOrderItemRow[] })[];
    const activityIds = [...new Set(rows.flatMap((o) => o.items.map((i) => i.activity_id)).filter((id): id is number => id != null))];
    const activities = new Map<number, ActivityFacts>();
    if (activityIds.length) {
      const { data: acts } = await web
        .from("activities")
        .select("id, name, offering_kind, starts_on")
        .in("id", activityIds);
      for (const a of (acts ?? []) as Row[]) {
        activities.set(Number(a.id), {
          name: String(a.name ?? ""),
          offeringKind: (a.offering_kind as string | null) ?? null,
          startsOn: (a.starts_on as string | null) ?? null,
        });
      }
    }
    for (const id of DAY_CAMP_PACK_IDS) if (!activities.has(id)) activities.set(id, { name: "Day Camp Pack", offeringKind: null, startsOn: null });

    for (const order of rows) {
      const items = order.items.filter((item) => isDayCampItem(item, activities));
      if (!items.length) continue;
      run.orders += 1;
      const reference = receiptReference(order);
      try {
        const family = await hubFamilyFor(order.email);
        if (family === "none") { run.noFamily.push(reference); continue; }
        if (family === "ambiguous") { run.ambiguous.push(reference); continue; }

        const purchase = dayCampPurchaseFromOrder({
          order,
          items,
          activities,
          familyId: family.id,
          familyName: family.name,
          creditsRedeemed: isFreeOrder(order) ? await creditsRedeemed(order.stripe_payment_intent ?? "") : null,
        });
        if (options.dryRun) {
          run.filed.push(`${reference} (dry run: ${family.name ?? family.id}, ${purchase.paidWith}, ${purchase.lines.length} line${purchase.lines.length === 1 ? "" : "s"})`);
          continue;
        }
        if (options.refile) {
          if (await refileReceipt(purchase)) run.filed.push(reference);
          else run.failed.push(reference);
          continue;
        }
        const result = await recordPortalPurchase(purchase, { notify: false });
        if (result.alreadyRecorded) run.alreadyFiled += 1;
        else if (result.filed) run.filed.push(reference);
        else run.failed.push(reference);
      } catch (error) {
        console.error(`receipts: day camp order ${reference} not filed`, error);
        run.failed.push(reference);
      }
    }
  } catch (error) {
    console.error("receipts: could not read day camp orders", error);
  }
  return run;
}

/** The order the portal's credit booking just made, found by the hold it spent. */
export async function fileReceiptForHold(holdId: string): Promise<DayCampReceiptRun | null> {
  try {
    const { data } = await getWebsiteReadClient()
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent", `free_${holdId}`)
      .maybeSingle();
    const id = (data as { id?: string } | null)?.id;
    return id ? await fileDayCampOrderReceipts({ orderIds: [id] }) : null;
  } catch (error) {
    console.error(`receipts: no order found for hold ${holdId}`, error);
    return null;
  }
}
