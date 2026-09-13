/**
 * Day camps — the punch card's few fixed numbers.
 *
 * CJ, 13 Sep 2026: "I want a DAY CAMP PUNCHCARD line in the navigation with
 * all of the dates listed, and then they can assign their credits based on
 * what they bought to the days… Also allow them to buy more credits or
 * individual days… If they purchased a specific day — show that and do not let
 * them change, but allow them to add more to give them the deal and check out."
 *
 * THESE ARE COPIES, NOT A SECOND PRICE LIST. The registration system prices
 * every cart in `netlify/functions/reg-config.mjs` (website repo): a day camp
 * is $79, five day camps for one camper in ONE order are $349 (the "cart-form
 * pack"), and the credit packs 990010 / 990011 grant 5 and 10 credits. The
 * portal never charges anybody — a paid cart is handed to the website's own
 * checkout — so what these numbers do here is let the tray say "add 2 more
 * and pay $349 for all five" BEFORE the family gets there, and say it with the
 * same arithmetic the checkout will use. tests/day-camps.test.ts pins that
 * arithmetic against the cases in the website's tests/day-camp-packs.test.mjs.
 * If reg-config.mjs changes, change this file the same day.
 */

/** `DAY_CAMP_MAX_CENTS`-class item: every day camp in the catalog is $79. */
export const DAY_CAMP_PRICE_CENTS = 7900;
/** `DAY_CAMP_PACK_SIZE` — five day camps for one camper in one order… */
export const DAY_CAMP_PACK_SIZE = 5;
/** …price to `DAY_CAMP_PACK_CENTS`, $349, packs stacking. */
export const DAY_CAMP_PACK_CENTS = 34900;

/** `DAY_CAMP_PACKS` in reg-config.mjs — the credit products, sold by direct link. */
export const DAY_CAMP_PACKS: Record<number, { name: string; credits: number; cents: number }> = {
  990010: { name: "Day Camp Pack", credits: 5, cents: 34900 },
  990011: { name: "Day Camp 10-Pack", credits: 10, cents: 67500 },
};
export const DAY_CAMP_PACK_IDS = Object.keys(DAY_CAMP_PACKS).map(Number);
export const isDayCampPack = (activityId: number): boolean => activityId in DAY_CAMP_PACKS;

/** A pack bought by the end of Mon 21 Sep 2026 ET also grants two Snow Day credits. */
export const DAY_CAMP_PACK_SNOW_BONUS = 2;
export const DAY_CAMP_PACK_SNOW_END = "2026-09-22T03:59:59Z";
export const snowBonusOpen = (now: Date = new Date()): boolean =>
  now.getTime() <= Date.parse(DAY_CAMP_PACK_SNOW_END);

/**
 * Policy, not data: there is no expiry column anywhere. It is the sentence on
 * day-camps.html and the account page, repeated here so the card can say it.
 */
export const DAY_CAMP_CREDITS_GOOD_THROUGH = "June 30, 2027";

/** Every one of the 63 listings carries the same hours. */
export const DAY_CAMP_HOURS = "8:30 AM – 4:15 PM";

/** Age bands, as the catalog's `age_range` spells them ("5 – 9 yrs"). */
export interface AgeBand {
  /** "5-9" — the key the staff portal's reg_norm_ages() folds to as well. */
  key: string;
  lo: number;
  hi: number;
  /** "Ages 5–9", for the page. */
  label: string;
}

/**
 * The band lives in `age_range` TEXT ("5 – 9 yrs", en dash) — `min_age` and
 * `max_age` are null on every day camp, and the themed names ("Improv
 * Olympics") say nothing about age. Never read a band off a name.
 */
export function parseAgeBand(ageRange: string | null | undefined): AgeBand | null {
  if (!ageRange) return null;
  const m = /(\d+)\s*[–—-]\s*(\d+)/.exec(ageRange);
  if (!m) return null;
  const lo = Number(m[1]);
  const hi = Number(m[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi < lo) return null;
  return { key: `${lo}-${hi}`, lo, hi, label: `Ages ${lo}–${hi}` };
}

/** The three bands every date runs, in age order. */
export const DAY_CAMP_BANDS: AgeBand[] = [
  { key: "5-9", lo: 5, hi: 9, label: "Ages 5–9" },
  { key: "9-12", lo: 9, hi: 12, label: "Ages 9–12" },
  { key: "12-15", lo: 12, hi: 15, label: "Ages 12–15" },
];

/** Whole years old on a day. Both are yyyy-MM-dd; no zone to get wrong. */
export function ageOn(birthdate: string | null | undefined, day: string): number | null {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return null;
  }
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [dy, dm, dd] = day.split("-").map(Number);
  let age = dy - by;
  if (dm < bm || (dm === bm && dd < bd)) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export interface BandChoice {
  /** The band the row starts on; null when there is no good guess. */
  defaultKey: string | null;
  /** Bands worth offering beside the default. All three when age is unknown. */
  offered: string[];
  /** Said on the card when the child is outside every band, or has no birthday. */
  note?: string;
}

/**
 * Which session a child should land on for a date.
 *
 * The bands overlap at 9 and at 12 on purpose (the website has always sold
 * them that way), so a nine-year-old is a real choice: they stay with the
 * younger group by default and are offered the older one. A twelve-year-old
 * the same, one band up. Outside 5–15, or with no birthday on file, nothing is
 * chosen for them and every band is offered — the website allows it, and a
 * parent who knows their child is the one to pick.
 */
export function bandChoiceForAge(age: number | null): BandChoice {
  const all = DAY_CAMP_BANDS.map((b) => b.key);
  if (age == null) {
    return { defaultKey: null, offered: all, note: "Add a birthday to the profile and we'll pick the right age group." };
  }
  if (age < 5 || age > 15) {
    return { defaultKey: null, offered: all, note: `Day camps are for ages 5–15; ${age} is outside that — call the office if you'd like to talk it through.` };
  }
  if (age <= 8) return { defaultKey: "5-9", offered: ["5-9"] };
  if (age === 9) return { defaultKey: "5-9", offered: ["5-9", "9-12"] };
  if (age <= 11) return { defaultKey: "9-12", offered: ["9-12"] };
  if (age === 12) return { defaultKey: "9-12", offered: ["9-12", "12-15"] };
  return { defaultKey: "12-15", offered: ["12-15"] };
}

export interface DayPricing {
  days: number;
  cents: number;
  /** Whole cart-form packs the checkout will recognize. */
  packs: number;
  /** Days paid singly, at $79. */
  singles: number;
  /** "Add 2 more and pay $349 for all five" — absent when the count is a whole number of packs, or zero. */
  nudge?: { more: number; totalDays: number; totalCents: number };
  /** $349 ÷ 5 — the per-day figure the tray quotes beside the nudge. */
  perDayPackedCents: number;
}

/**
 * What the website's checkout will charge for N day camps for ONE camper in
 * ONE order — `priceCart`'s cart-form rule, nothing more: whole fives at $349,
 * the rest at $79. Sibling discounts never enter it because the tray is per
 * child and a child checks out alone.
 */
export function priceDays(days: number): DayPricing {
  const n = Math.max(0, Math.floor(days));
  const packs = Math.floor(n / DAY_CAMP_PACK_SIZE);
  const singles = n - packs * DAY_CAMP_PACK_SIZE;
  const cents = packs * DAY_CAMP_PACK_CENTS + singles * DAY_CAMP_PRICE_CENTS;
  const pricing: DayPricing = {
    days: n,
    cents,
    packs,
    singles,
    perDayPackedCents: Math.round(DAY_CAMP_PACK_CENTS / DAY_CAMP_PACK_SIZE),
  };
  if (n > 0 && singles > 0) {
    const totalDays = (packs + 1) * DAY_CAMP_PACK_SIZE;
    pricing.nudge = {
      more: DAY_CAMP_PACK_SIZE - singles,
      totalDays,
      totalCents: (packs + 1) * DAY_CAMP_PACK_CENTS,
    };
  }
  return pricing;
}
