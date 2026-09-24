import { DAY_CAMP_PACKS, isDayCampPack } from "@/config/day-camps";
import type { PortalPurchase, PurchaseLine } from "./purchase";

/**
 * A novapa.org order, read as a day camp receipt. Pure: rows in, receipt out.
 * The reading and filing live in registration-orders.ts.
 */

export interface WebsiteOrderRow {
  id: string;
  order_no: number | null;
  email: string;
  parent_name: string | null;
  status: string;
  total_cents: number | null;
  amount_today_cents: number | null;
  installments_paid_cents: number | null;
  stripe_payment_intent: string | null;
  created_at: string;
}

export interface WebsiteOrderItemRow {
  camper_name: string | null;
  unit_price_cents: number | null;
  activity_id: number | null;
}

export interface ActivityFacts {
  name: string;
  offeringKind: string | null;
  startsOn: string | null;
}

/** A day camp day, or a pack of them. The only orders this receipt covers. */
export function isDayCampItem(item: WebsiteOrderItemRow, activities: Map<number, ActivityFacts>): boolean {
  if (item.activity_id == null) return false;
  if (isDayCampPack(item.activity_id)) return true;
  return activities.get(item.activity_id)?.offeringKind === "day_camp";
}

/** "Mon, Oct 12, 2026" from "2026-10-12", without a time zone nudging the day. */
export function formatCampDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Does "Ages 5–9 Day Camp · Jan 18, 2027" already say "Mon, Jan 18, 2027"? */
export function nameHasDate(name: string, formatted: string): boolean {
  const monthDay = formatted.replace(/^[A-Za-z]+, /, "").replace(/, \d{4}$/, ""); // "Jan 18"
  return name.includes(monthDay);
}

export function receiptReference(order: WebsiteOrderRow): string {
  return order.order_no != null ? `REG-${order.order_no}` : `REG-${order.id.slice(0, 8)}`;
}

/** A $0 order: settled by day camp credits or a 100% coupon, never by a card. */
export function isFreeOrder(order: WebsiteOrderRow): boolean {
  return (order.stripe_payment_intent ?? "").startsWith("free_");
}

export function dayCampPurchaseFromOrder(input: {
  order: WebsiteOrderRow;
  items: WebsiteOrderItemRow[];
  activities: Map<number, ActivityFacts>;
  familyId: string;
  familyName: string | null;
  /** Credits the order redeemed, from public.credit_events. Null if unknown. */
  creditsRedeemed: number | null;
}): PortalPurchase {
  const { order, items, activities } = input;
  const free = isFreeOrder(order);

  // In date order, packs first: the order the family will live them in.
  const when = (item: WebsiteOrderItemRow) => activities.get(item.activity_id ?? 0)?.startsOn ?? "";
  const sorted = [...items].sort((a, b) => when(a).localeCompare(when(b)));

  const lines: PurchaseLine[] = sorted.map((item) => {
    const id = item.activity_id ?? 0;
    const pack = isDayCampPack(id) ? DAY_CAMP_PACKS[id] : null;
    const facts = activities.get(id);
    const name = facts?.name?.trim() || "Day camp";
    const date = facts?.startsOn ? formatCampDate(facts.startsOn) : null;
    // Many catalog names already carry their date ("Ages 5–9 Day Camp · Jan
    // 18, 2027"); printing it again read as two dates on one line.
    const what = pack ? pack.name : date && !nameHasDate(name, date) ? `${name}, ${date}` : name;
    return {
      description: item.camper_name ? `${what} - ${item.camper_name}` : what,
      quantity: 1,
      unitCents: free ? 0 : Math.max(0, item.unit_price_cents ?? 0),
    };
  });

  const paidCents = free
    ? 0
    : Math.max(0, (order.amount_today_cents ?? 0) + (order.installments_paid_cents ?? 0));

  let paidWith: string;
  if (!free) paidWith = "Card (Stripe)";
  else if (input.creditsRedeemed && input.creditsRedeemed > 0)
    paidWith = `${input.creditsRedeemed} day camp credit${input.creditsRedeemed === 1 ? "" : "s"}`;
  else paidWith = "No charge (credit or coupon)";

  const students = [...new Set(items.map((i) => i.camper_name?.trim()).filter((n): n is string => Boolean(n)))];

  return {
    kind: "day_camp",
    reference: receiptReference(order),
    familyId: input.familyId,
    familyName: input.familyName,
    buyerName: order.parent_name?.trim() || null,
    familyEmail: order.email,
    studentNames: students,
    lines,
    totalCents: paidCents,
    paidAt: order.created_at,
    paidWith,
    paymentRef: free ? null : order.stripe_payment_intent,
  };
}
