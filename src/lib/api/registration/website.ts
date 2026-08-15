import { RegistrationUnavailableError, type RegistrationProvider } from "./provider";
import type {
  ExternalAccount,
  ExternalEnrollment,
  ExternalParticipant,
  RegistrationSnapshot,
} from "./types";
import { getWebsiteReadClient } from "../supabase/client";

/**
 * The REAL registration adapter: reads the org's own registration system
 * directly out of the shared novapa database (`public` schema — families,
 * campers, orders, order_items). This is the "registration data later"
 * NEEDS-FROM-TONY.md #8 was waiting for; it turned out to live in the same
 * Supabase project the family hub moved into, so no HTTP API is needed.
 *
 * READ-ONLY by contract: this module only ever SELECTs. The website owns
 * these tables and the family hub must never write to them.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

/** "Ava Rose Martinez" → { firstName: "Ava", lastName: "Rose Martinez" } */
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const normalize = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

export class WebsiteDbRegistrationProvider implements RegistrationProvider {
  readonly source = "website" as const;
  readonly displayName = "NOVA PA website registration (shared database)";

  isConfigured(): boolean {
    return Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  async fetchSnapshot(): Promise<RegistrationSnapshot> {
    if (!this.isConfigured()) {
      throw new RegistrationUnavailableError("Supabase is not configured", this.source);
    }

    const [familyRows, camperRows, itemRows] = await Promise.all([
      this.selectAll("families", "id, email, parent_name, is_test"),
      this.selectAll("campers", "id, family_id, name, birthdate"),
      this.selectAll(
        "order_items",
        "id, show, band, camper_name, unit_price_cents, order:orders(id, email, status, total_cents, amount_today_cents, created_at)"
      ),
    ]);

    const accounts: ExternalAccount[] = [];
    const familyByEmail = new Map<string, string>();
    for (const row of familyRows) {
      const id = str(row.id);
      const email = str(row.email)?.toLowerCase();
      if (!id || !email || row.is_test === true) continue;
      accounts.push({
        externalId: id,
        source: this.source,
        guardianName: str(row.parent_name) ?? email,
        email,
      });
      familyByEmail.set(email, id);
    }
    const realFamilyIds = new Set(accounts.map((a) => a.externalId));

    const participants: ExternalParticipant[] = [];
    /** `${familyId}:${normalized camper name}` → camper external id */
    const camperByFamilyName = new Map<string, string>();
    for (const row of camperRows) {
      const id = str(row.id);
      const familyId = str(row.family_id);
      const name = str(row.name);
      if (!id || !familyId || !name || !realFamilyIds.has(familyId)) continue;
      participants.push({
        externalId: id,
        accountExternalId: familyId,
        ...splitName(name),
        dateOfBirth: str(row.birthdate),
      });
      camperByFamilyName.set(`${familyId}:${normalize(name)}`, id);
    }

    // Per-order totals so an installment balance can be split across items.
    const orderItemTotal = new Map<string, number>();
    for (const row of itemRows) {
      const order = row.order as Row | null;
      const orderId = order ? str(order.id) : undefined;
      if (!orderId) continue;
      orderItemTotal.set(
        orderId,
        (orderItemTotal.get(orderId) ?? 0) + num(row.unit_price_cents)
      );
    }

    const enrollments: ExternalEnrollment[] = [];
    for (const row of itemRows) {
      const id = str(row.id);
      const order = row.order as Row | null;
      if (!id || !order) continue;
      const email = str(order.email)?.toLowerCase();
      const familyId = email ? familyByEmail.get(email) : undefined;
      if (!familyId) continue; // reconcile reports the account as unmatched
      const show = str(row.show) ?? "Unknown offering";
      const band = str(row.band);
      const camperName = str(row.camper_name);
      const participantId =
        (camperName && camperByFamilyName.get(`${familyId}:${normalize(camperName)}`)) ??
        // No camper record with that name: keep a stable synthetic id so the
        // sync engine can flag it as an unmatched participant, not drop it.
        `unmatched:${familyId}:${normalize(camperName ?? "unknown")}`;

      const status = /cancel|refund/i.test(str(order.status) ?? "")
        ? ("cancelled" as const)
        : ("enrolled" as const);

      // Installment plans carry the outstanding balance at the ORDER level;
      // split it (and the amount paid) across items by price share.
      const orderTotal = orderItemTotal.get(str(order.id) ?? "") || 0;
      const share = orderTotal > 0 ? num(row.unit_price_cents) / orderTotal : 0;
      const orderBalance = Math.max(0, num(order.total_cents) - num(order.amount_today_cents));

      enrollments.push({
        externalId: id,
        source: this.source,
        participantExternalId: participantId,
        accountExternalId: familyId,
        offeringName: band ? `${show} (${band})` : show,
        status,
        balanceCents: Math.round(orderBalance * share),
        amountPaidCents: Math.round(num(order.amount_today_cents) * share),
        enrolledAt: str(order.created_at) ?? new Date().toISOString(),
      });
    }

    return {
      accounts,
      participants,
      enrollments,
      fetchedAt: new Date().toISOString(),
      source: this.source,
    };
  }

  /** SELECT with pagination — PostgREST caps a single response at 1000 rows. */
  private async selectAll(table: string, columns: string): Promise<Row[]> {
    const db = getWebsiteReadClient();
    const all: Row[] = [];
    const page = 1000;
    for (let from = 0; ; from += page) {
      const { data, error } = await db
        .from(table)
        .select(columns)
        .range(from, from + page - 1);
      if (error) {
        throw new RegistrationUnavailableError(
          `Reading ${table} from the website database failed: ${error.message}`,
          this.source
        );
      }
      all.push(...((data ?? []) as unknown as Row[]));
      if (!data || data.length < page) return all;
    }
  }
}

/* ── cast roster (casting module bridge) ────────────────────────────────── */

export interface WebsiteCastRosterEntry {
  email: string;
  session: string;
  castName: string;
}

/**
 * The website's cast_roster_2026 table: which cast/session each family's
 * email belongs to. Surfaced on the admin casting page so directors see the
 * registration system's roster next to the family hub's audition roster.
 */
export async function fetchWebsiteCastRoster(): Promise<WebsiteCastRosterEntry[]> {
  const db = getWebsiteReadClient();
  const { data, error } = await db
    .from("cast_roster_2026")
    .select("email, session, cast_name")
    .range(0, 4999);
  if (error) {
    throw new RegistrationUnavailableError(
      `Reading cast_roster_2026 failed: ${error.message}`,
      "website"
    );
  }
  return (data ?? []).flatMap((row: Row) => {
    const email = str(row.email)?.toLowerCase();
    if (!email) return [];
    return [
      {
        email,
        session: str(row.session) ?? "",
        castName: str(row.cast_name) ?? "",
      },
    ];
  });
}
