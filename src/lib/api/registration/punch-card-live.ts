import "server-only";
import { DAY_CAMP_PACK_IDS } from "@/config/day-camps";
import {
  getServiceClient,
  getWebsiteAnonClient,
  getWebsiteReadClient,
  isSupabaseConfigured,
} from "../supabase/client";
import {
  PAID_STATUSES,
  householdEmails,
  type PunchCardInput,
  type PunchCardStudent,
  type RawActivity,
  type RawCamper,
  type RawCreditEvent,
  type RawFamily,
  type RawOrderItem,
} from "./punch-card";

/**
 * The punch card's rows, read live out of the shared database.
 *
 * READ-ONLY. Every call here is a SELECT or the website's own STABLE
 * `catalog_list()` RPC. The one thing the punch card ever writes — a $0
 * booking — goes through the registration system's checkout in
 * `src/lib/actions/day-camps.ts`, never through this client.
 *
 * Returns null when the registration system could not be read. The caller
 * turns that into the "unavailable" board; it must never become a card that
 * says "no credits".
 */

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export async function readPunchCardInput(familyId: string): Promise<PunchCardInput | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const hub = getServiceClient();
    const web = getWebsiteReadClient();

    const [{ data: studentRows, error: studentErr }, { data: link, error: linkErr }] =
      await Promise.all([
        hub
          .from("students")
          .select("id, first_name, last_name, preferred_name, date_of_birth, camper_id")
          .eq("family_id", familyId)
          .order("date_of_birth"),
        hub
          .from("registration_account_links")
          .select("external_email")
          .eq("family_id", familyId)
          .eq("source", "website")
          .maybeSingle(),
      ]);
    if (studentErr || linkErr) return null;

    const students: PunchCardStudent[] = (studentRows ?? []).map((r: Row) => ({
      id: String(r.id),
      firstName: String(r.first_name ?? ""),
      lastName: String(r.last_name ?? ""),
      preferredName: str(r.preferred_name) ?? undefined,
      dateOfBirth: str(r.date_of_birth) ?? undefined,
      camperId: str(r.camper_id) ?? undefined,
    }));
    const linkEmail = str((link as Row | null)?.external_email)?.toLowerCase() ?? null;

    const camperIds = students.flatMap((s) => (s.camperId ? [s.camperId] : []));
    const campers: RawCamper[] = [];
    if (camperIds.length) {
      const { data, error } = await web
        .from("campers")
        .select("id, name, family_id, birthdate, day_camp_credits, snow_day_credits")
        .in("id", camperIds);
      if (error) return null;
      for (const r of (data ?? []) as Row[]) {
        const id = str(r.id);
        const name = str(r.name);
        const fid = str(r.family_id);
        if (!id || !name || !fid) continue;
        campers.push({
          id,
          name,
          familyId: fid,
          birthdate: str(r.birthdate),
          dayCredits: num(r.day_camp_credits),
          snowCredits: num(r.snow_day_credits),
        });
      }
    }

    const familyIds = [...new Set(campers.map((c) => c.familyId))];
    const families: RawFamily[] = [];
    if (familyIds.length) {
      const { data, error } = await web
        .from("families")
        .select("id, email, cc_email, parent_name")
        .in("id", familyIds);
      if (error) return null;
      for (const r of (data ?? []) as Row[]) {
        const id = str(r.id);
        const email = str(r.email);
        if (!id || !email) continue;
        families.push({ id, email, ccEmail: str(r.cc_email), parentName: str(r.parent_name) });
      }
    }

    /*
     * The catalog through the website's OWN list: `remaining` there is the
     * spots-left figure the checkout enforces — capacity less sold, less
     * booked_offline, less active holds. Recomputing it here from the raw
     * columns is how the account page said Frozen Jr had ten open seats when
     * it was full. p_ids unhides the two credit packs, which are sold by
     * direct link only.
     */
    const { data: catalogRows, error: catalogErr } = await getWebsiteAnonClient().rpc("catalog_list", {
      p_ids: DAY_CAMP_PACK_IDS,
    });
    if (catalogErr) return null;
    const catalog: RawActivity[] = [];
    const seen = new Set<number>();
    for (const r of (catalogRows ?? []) as Row[]) {
      const id = Number(r.id);
      if (!Number.isFinite(id)) continue;
      const kind = str(r.offering_kind);
      if (kind !== "day_camp" && !DAY_CAMP_PACK_IDS.includes(id)) continue;
      seen.add(id);
      catalog.push(activityFromRow(r, true));
    }

    // Every address the household buys under, across every linked camper's family.
    const emails = new Set<string>();
    for (const f of families) for (const e of householdEmails(f, linkEmail)) emails.add(e);
    if (linkEmail) emails.add(linkEmail);

    const orderItems: RawOrderItem[] = [];
    const creditEvents: RawCreditEvent[] = [];
    if (emails.size) {
      const list = [...emails];
      const [{ data: orders, error: orderErr }, { data: events, error: eventErr }] =
        await Promise.all([
          web
            .from("orders")
            .select("id, email, status, created_at")
            .or(list.map((e) => `email.ilike.${escapeIlike(e)}`).join(","))
            .in("status", [...PAID_STATUSES]),
          web
            .from("credit_events")
            .select("payment_intent, email, detail, created_at")
            .or(list.map((e) => `email.ilike.${escapeIlike(e)}`).join(","))
            .order("created_at"),
        ]);
      if (orderErr || eventErr) return null;

      const orderById = new Map<string, Row>();
      for (const o of (orders ?? []) as Row[]) if (str(o.id)) orderById.set(String(o.id), o);
      if (orderById.size) {
        const { data: items, error: itemErr } = await web
          .from("order_items")
          .select("id, order_id, activity_id, camper_name, unit_price_cents")
          .in("order_id", [...orderById.keys()]);
        if (itemErr) return null;
        for (const it of (items ?? []) as Row[]) {
          const order = orderById.get(String(it.order_id));
          if (!order) continue;
          orderItems.push({
            id: String(it.id),
            orderId: String(it.order_id),
            activityId: typeof it.activity_id === "number" ? it.activity_id : null,
            camperName: str(it.camper_name),
            unitPriceCents: num(it.unit_price_cents),
            orderEmail: String(order.email ?? ""),
            orderStatus: String(order.status ?? ""),
            createdAt: String(order.created_at ?? ""),
          });
        }
      }
      for (const ev of (events ?? []) as Row[]) {
        creditEvents.push({
          paymentIntent: String(ev.payment_intent ?? ""),
          email: String(ev.email ?? ""),
          createdAt: String(ev.created_at ?? ""),
          detail: (ev.detail as RawCreditEvent["detail"]) ?? null,
        });
      }
    }

    // A booked day whose listing has since been switched off is not in
    // catalog_list; read those few rows directly so the card can still name them.
    const missing = [
      ...new Set(
        orderItems
          .map((it) => it.activityId)
          .filter((id): id is number => id != null && !seen.has(id))
      ),
    ];
    if (missing.length) {
      const { data, error } = await web
        .from("activities")
        .select("id, name, age_range, starts_on, offering_kind, price_cents, description")
        .in("id", missing);
      if (error) return null;
      for (const r of (data ?? []) as Row[]) catalog.push(activityFromRow(r, false));
    }

    return { students, linkEmail, campers, families, catalog, orderItems, creditEvents };
  } catch {
    return null;
  }
}

function activityFromRow(r: Row, fromCatalog: boolean): RawActivity {
  return {
    id: Number(r.id),
    name: String(r.name ?? ""),
    ageRange: str(r.age_range),
    startsOn: str(r.starts_on),
    offeringKind: str(r.offering_kind),
    priceCents: typeof r.price_cents === "number" ? r.price_cents : null,
    remaining: fromCatalog && typeof r.remaining === "number" ? r.remaining : fromCatalog ? null : 0,
    bookable: fromCatalog ? r.bookable === true : false,
    description: str(r.description),
  };
}

/** PostgREST `or=` values are comma-separated; an address never carries one, but a stray would break the filter. */
function escapeIlike(email: string): string {
  return email.replace(/[,()]/g, "");
}
