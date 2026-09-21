import { registration } from "@/config/registration";

/**
 * What a family can sign up for right now, read from the org's own catalog
 * (`public.activities` — the same table the public site's Register buttons
 * read).
 *
 * There is no second list here and there must never be one. The catalog is
 * maintained by hand in the registration system; anything this app kept
 * alongside it would be a copy that goes stale silently, and the failure mode
 * of a stale copy is a family paying for a camp that filled last week.
 */

export type OfferingKind = "class" | "camp" | "lesson" | "show";

export interface OpenOffering {
  /** public.activities.id — the id the registration deep link is built from. */
  activityId: number;
  kind: OfferingKind;
  name: string;
  /** "5 – 9 yrs", as the catalog writes it. */
  ageRange?: string;
  priceCents?: number;
  /**
   * Places left: capacity minus sold minus booked offline minus active
   * unexpired holds, as catalog_list() computes it. Undefined when the
   * offering has no capacity, which is most coaching.
   */
  openSpots?: number;
  /** Where a family goes to book it. */
  registerUrl: string;
}

/** How the four catalog categories read to a parent. */
export const KIND_LABEL: Record<OfferingKind, string> = {
  class: "Classes",
  camp: "Camps & musicals",
  lesson: "Private lessons",
  show: "Shows",
};

/**
 * The catalog's category, in this app's words.
 *
 * "camp" carries both a one-day camp and a two-week Broadway Bound musical,
 * because that is how they are sold. They are not split here: a split would be
 * this app second-guessing the catalog, and the names already say which is
 * which.
 */
export function kindOf(category: unknown): OfferingKind | null {
  switch (String(category ?? "").trim().toLowerCase()) {
    case "class":
      return "class";
    case "camp":
      return "camp";
    case "coaching":
      return "lesson";
    case "performance":
      return "show";
    default:
      // An unrecognized category is not guessed at. It simply is not offered,
      // and the count of what was left out is reported rather than hidden.
      return null;
  }
}

/*
 * Offerings the office has taken off the portal's own sign-up card, whatever
 * the catalog still says about them. CJ, 18 Sep 2026: "don't advertise any of
 * Frozen programs anymore for sign ups."
 *
 * Three Frozen rows were bookable that morning (Kids, Junior and Teens), and
 * Junior had been selling past its cast size. This suppresses them HERE ONLY:
 * the catalog stays the source of truth, the office can still take a booking,
 * and the public site is not this app's to change. Empty the list to put them
 * back.
 */
export const SUPPRESSED_FROM_SIGNUP: RegExp[] = [/frozen/i];

/** Has the office pulled this offering off the portal's sign-up card? */
export function isSuppressedFromSignup(name: string): boolean {
  return SUPPRESSED_FROM_SIGNUP.some((pattern) => pattern.test(name));
}

/**
 * One catalog row as something a family can act on.
 *
 * The row is one that `public.catalog_list()` returned. That function has
 * already dropped anything inactive or hidden and has already worked out both
 * `bookable` (which it widens to include the registration window) and
 * `remaining`. A row failing either is one the office has decided nobody
 * should be buying, and this app does not get a second opinion.
 *
 * `active` and `hidden` are still honoured when a caller hands over a raw
 * `activities` row, so a direct read cannot quietly lose those two checks.
 *
 * Note what is NOT used: `pdp_url`. It is a relative path into the org's old
 * Sawyer account, which knows nothing about the balances or enrollments in this
 * app — see the note in config/registration.ts. The deep link is built from the
 * id instead, which is what the public site's own Register buttons use.
 */
export function offeringFromRow(row: Record<string, unknown>): OpenOffering | null {
  // catalog_list() has filtered these two already and so does not return them.
  if (row.active === false || row.hidden === true) return null;
  if (!row.bookable) return null;

  const activityId = Number(row.id);
  if (!Number.isFinite(activityId) || activityId <= 0) return null;

  const kind = kindOf(row.category);
  if (!kind) return null;

  const name = str(row.name);
  if (!name) return null;

  // Pulled by the office, not by the catalog. See SUPPRESSED_FROM_SIGNUP.
  if (isSuppressedFromSignup(name)) return null;

  /*
   * Sold out is not "open". The catalog leaves the row active because there is
   * a waitlist, but a family reading "register" should not find a full week.
   *
   * This reads `remaining`, never `open_spots`. open_spots is hand maintained
   * and was wrong on nearly half the catalog on 18 Sep 2026, including a 663
   * on a production with one seat left. `remaining` is the checkout's own
   * arithmetic: capacity - sold - booked_offline - held, clamped at zero, and
   * null when the offering has no capacity to run out of.
   */
  const openSpots = num(row.remaining);
  if (openSpots !== undefined && openSpots <= 0) return null;

  return {
    activityId,
    kind,
    name,
    ageRange: str(row.age_range),
    priceCents: num(row.price_cents),
    openSpots,
    registerUrl: registration.activityUrl(activityId),
  };
}

/**
 * Group for display, cheapest-looking first within a kind so the list opens
 * with something approachable rather than a $995 musical.
 *
 * `limitPerKind` exists because the catalog runs to 124 open rows and a
 * dashboard is not a shop. What is cut is COUNTED, so the card can say "and 71
 * more" and link to the full list instead of quietly pretending the rest do
 * not exist.
 */
export function groupOfferings(
  offerings: OpenOffering[],
  limitPerKind = 3
): Array<{ kind: OfferingKind; label: string; shown: OpenOffering[]; more: number }> {
  const order: OfferingKind[] = ["class", "camp", "lesson", "show"];
  const byKind = new Map<OfferingKind, OpenOffering[]>();
  for (const offering of offerings) {
    const list = byKind.get(offering.kind) ?? [];
    list.push(offering);
    byKind.set(offering.kind, list);
  }

  return order
    .filter((kind) => byKind.has(kind))
    .map((kind) => {
      const all = [...byKind.get(kind)!].sort(
        (a, b) =>
          (a.priceCents ?? Number.MAX_SAFE_INTEGER) -
            (b.priceCents ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name)
      );
      return {
        kind,
        label: KIND_LABEL[kind],
        shown: all.slice(0, limitPerKind),
        more: Math.max(0, all.length - limitPerKind),
      };
    });
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim().replace(/\s+/g, " ");
  return text === "" ? undefined : text;
}

function num(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
