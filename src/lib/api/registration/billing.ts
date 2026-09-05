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
 * FAILURE IS SILENCE, like the account page itself: no link, no token, a
 * slow or failing endpoint — all return null, and the dashboard renders no
 * billing section rather than a broken one.
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

const REG_ACCOUNT_URL = "https://novapa.org/api/reg-account";
const FETCH_TIMEOUT_MS = 12_000;

export async function fetchUpcomingPayments(
  familyId: string
): Promise<UpcomingPayment[] | null> {
  if (!familyId || !isSupabaseConfigured()) return null;
  try {
    const hub = getServiceClient();
    const { data: link } = await hub
      .from("registration_account_links")
      .select("external_id")
      .eq("family_id", familyId)
      .eq("source", "website")
      .maybeSingle();
    const externalId = (link as { external_id?: string } | null)?.external_id;
    if (!externalId) return null;

    const { data: fam } = await getWebsiteReadClient()
      .from("families")
      .select("portal_token")
      .eq("id", externalId)
      .maybeSingle();
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
      if (!res.ok) return null;
      payload = await res.json();
    } finally {
      clearTimeout(timer);
    }

    const raw = (payload as { payments?: { upcoming?: unknown } | null } | null)
      ?.payments?.upcoming;
    if (!Array.isArray(raw)) return null;

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
    return upcoming.length ? upcoming : null;
  } catch {
    return null; // billing display must never break the dashboard
  }
}
