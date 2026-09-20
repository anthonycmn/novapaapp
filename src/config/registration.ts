/**
 * Registration configuration (#8).
 *
 * SYNC SOURCE OF RECORD: the org's own registration system, which lives in the
 * SAME Supabase project as this app (`public` schema — families, campers,
 * orders, order_items). There is no HTTP API and none is needed; see
 * `lib/api/registration/website.ts`.
 *
 * DEEP-LINK DESTINATIONS: families buy at `/register/` on the main site. That
 * flow runs on this same database and a live Stripe key, and it is where all
 * 235 enrollments and every dollar of outstanding balance in this app actually
 * came from.
 *
 * This used to point at Sawyer and RegPack, which is where the *previous*
 * signup flow sent people. Those links were not merely unconfirmed, they were
 * wrong: a family clicking "Pay balance" was sent to a Sawyer account that
 * knows nothing about the balance this app is showing them. Corrected
 * 15 Aug 2026; every URL below was checked for a 200 before it shipped.
 *
 * Deep links use `?activity=<id>` — the same `public.activities.id` this app
 * already stores on an enrollment, which is why no separate mapping is needed.
 */

// novapa.org is primary and canonical since Sep 6, 2026. The old domain 301s
// here with the query string intact (checked Sep 20, 2026), but a deep link
// should not spend a redirect on its way to checkout.
const SITE = "https://novapa.org";

export const registration = {
  /** Where families browse and buy. */
  registrationLandingUrl: `${SITE}/register/`,

  /** Their own account: orders, installments, outstanding balance. */
  parentAccountUrl: `${SITE}/register/account.html`,

  /** Sign-in for the registration system (same auth pool as this app). */
  signInUrl: `${SITE}/register/signin.html`,

  /**
   * Deep link to one offering, by the website activity id carried on an
   * enrollment. This is what the public site's own "Register" buttons use.
   */
  activityUrl: (activityId: number | string) =>
    `${SITE}/register/?activity=${activityId}`,

  /**
   * The punch card's two doors into the registration system (13 Sep 2026).
   *
   * `regPayUrl` is the checkout's own server endpoint. The portal calls it
   * server-to-server with `confirm_free: true` to spend a Day Camp credit —
   * the exact request the website's pay step sends for a $0 cart, so the
   * order, the credit deduction and the roster row are all the registration
   * system's own work. `checkoutUrl` builds the address a family is sent to
   * when money is involved: the days in ?activity=, the child in ?kid=, and
   * back=portal so the confirmation page offers a way home. Stripe stays on
   * the website; the portal never sees a card.
   *
   * Both may be overridden by environment for a preview against a staging
   * checkout. In mock mode nothing here is called at all.
   */
  regPayUrl: process.env.REGISTRATION_PAY_URL ?? "https://novapa.org/api/reg-pay",
  regPayTimeoutMs: 15_000,
  checkoutUrl: (opts: { activityIds: number[]; email: string; kid: string }) => {
    const base = process.env.REGISTRATION_CHECKOUT_URL ?? "https://novapa.org/register/";
    const q = new URLSearchParams();
    q.set("activity", opts.activityIds.join(","));
    q.set("pe", opts.email);
    q.set("kid", opts.kid);
    q.set("back", "portal");
    return `${base}?${q.toString()}`;
  },

  /** Public marketing pages, for browsing rather than buying. */
  classesUrl: `${SITE}/classes`,
  coachingUrl: `${SITE}/coaching`,
  campsUrl: `${SITE}/camp-info`,

  /**
   * The previous commercial platforms. Kept only so a historical enrollment
   * whose `external_source` names one of them can still be explained to
   * whoever asks. NOT link targets any more — nothing in the app should send
   * a family here.
   */
  legacy: {
    sawyer: {
      orgSlug: "nova-performing-arts",
      locationId: "202081",
      schedulesUrl:
        "https://www.hisawyer.com/nova-performing-arts/schedules?location_id%5B%5D=202081",
    },
    regpack: {
      groupId: "100920141",
    },
  },
} as const;
