import { cache } from "react";
import { getServiceClient, getWebsiteReadClient, isSupabaseConfigured } from "../supabase/client";

/**
 * A family's upcoming payments, straight from the registration site.
 *
 * THE ONE SOURCE RULE. The registration site's account page already answers
 * "what will be charged and when" with live Stripe data — reg-account's
 * paymentsFor() carries months of hard-won edge cases (per-phase prices on
 * schedule-run plans, the +12h boundary probe, deposit-now plans that exist
 * only as a not_started schedule, seeded final-installment prices). Families
 * were told to trust that page (Jason to Haemy Park, Aug 17 2026), so this
 * app asks THAT endpoint rather than reading Stripe itself: two Stripe
 * readers is two ways to disagree about a family's money, and a family shown
 * two different "next payment" rows trusts neither. What the account page
 * says is what this app says, by construction.
 *
 * HOW IT AUTHENTICATES. The registration system mints a portal_token per
 * family — the credential its own email links carry. We hold it with the
 * service key, resolve it from the family's registration_account_links row
 * (the same join the sync trusts), and present it server-to-server. The
 * caller must already be authenticated as a guardian of exactly this family;
 * nothing here is reachable with anyone else's familyId.
 *
 * THREE ANSWERS, AND THE DIFFERENCE IS THE POINT (CJ, 5 Sep 2026: a plan
 * family reading "Paid" is the mistake this build exists to end):
 *
 *   UpcomingPayment[]  the endpoint answered. Empty means VERIFIED no
 *                      upcoming charges — "Paid" may be said out loud.
 *   null               no registration link or token: no plan can exist
 *                      through registration, so recorded balances stand.
 *   undefined          could not verify (endpoint down, timeout, malformed).
 *                      Callers must claim NOTHING — not "Paid", not a plan.
 */

/** One future charge, exactly as the registration site states it. */
export interface UpcomingPayment {
  /** Epoch ms of the charge. Format in org.timeZone, never server-local. */
  date: number;
  amountCents: number;
  desc: string;
  /** Epoch ms the plan ends, when it is a finite plan; null when open. */
  ends: number | null;
  /** True on an open subscription's next charge (class memberships). */
  renews: boolean;
}

export type BillingAnswer = UpcomingPayment[] | null | undefined;

const REG_ACCOUNT_URL = "https://novapa.org/api/reg-account";
const FETCH_TIMEOUT_MS = 12_000;

/**
 * Wrapped in React cache(): the dashboard asks three times per load (the
 * balance stat, the enrollment pills, the schedule panel) and the family's
 * plan must be fetched once and answered identically to all three.
 */
export const fetchUpcomingPayments = cache(fetchUpcomingPaymentsUncached);

async function fetchUpcomingPaymentsUncached(
  familyId: string
): Promise<BillingAnswer> {
  if (!familyId || !isSupabaseConfigured()) return undefined;
  try {
    const hub = getServiceClient();
    const { data: link, error: linkError } = await hub
      .from("registration_account_links")
      .select("external_id")
      .eq("family_id", familyId)
      .eq("source", "website")
      .maybeSingle();
    if (linkError) return undefined;
    const externalId = (link as { external_id?: string } | null)?.external_id;
    if (!externalId) return null;

    const { data: fam, error: famError } = await getWebsiteReadClient()
      .from("families")
      .select("portal_token")
      .eq("id", externalId)
      .maybeSingle();
    if (famError) return undefined;
    const token = (fam as { portal_token?: string } | null)?.portal_token;
    if (!token || !/^[0-9a-f-]{36}$/.test(token)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let payload: unknown;
    try {
      const res = await fetch(REG_ACCOUNT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal_token: token }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return undefined;
      payload = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const payments = (payload as { payments?: { upcoming?: unknown } | null } | null)
      ?.payments;
    // The endpoint reports null when IT could not read Stripe (key absent,
    // outage). That is "unknown", never "no plan" — the account page hides
    // its section on the same signal.
    if (payments == null) return undefined;
    const raw = payments.upcoming;
    if (!Array.isArray(raw)) return undefined;

    // Trust nothing implicitly: a row is shown only when its date and amount
    // are real numbers. A malformed row is dropped, never rendered as $NaN.
    const upcoming: UpcomingPayment[] = [];
    for (const row of raw) {
      const r = row as {
        date?: unknown; amount_cents?: unknown; desc?: unknown;
        ends?: unknown; renews?: unknown;
      };
      if (typeof r.date !== "number" || !Number.isFinite(r.date)) continue;
      if (typeof r.amount_cents !== "number" || !Number.isFinite(r.amount_cents) || r.amount_cents < 0) continue;
      upcoming.push({
        date: r.date,
        amountCents: Math.round(r.amount_cents),
        desc: typeof r.desc === "string" && r.desc.trim() ? r.desc.trim() : "Payment plan",
        ends: typeof r.ends === "number" && Number.isFinite(r.ends) ? r.ends : null,
        renews: r.renews === true,
      });
    }
    upcoming.sort((a, b) => a.date - b.date);
    return upcoming;
  } catch {
    return undefined; // billing display must never break the dashboard
  }
}
