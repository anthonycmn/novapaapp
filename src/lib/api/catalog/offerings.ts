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
  /** Places left, when the catalog tracks them. */
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

/**
 * One catalog row as something a family can act on.
 *
 * Returns null for anything unbookable. The three flags are the catalog's
 * own: `active` (still on sale), `bookable` (can be bought at all), `hidden`
 * (deliberately off the public site). A row failing any of them is one the
 * office has decided nobody should be buying, and this app does not get a
 * second opinion.
 *
 * Note what is NOT used: `pdp_url`. It is a relative path into the org's old
 * Sawyer account, which knows nothing about the balances or enrollments in this
 * app — see the note in config/registration.ts. The deep link is built from the
 * id instead, which is what the public site's own Register buttons use.
 */
export function offeringFromRow(row: Record<string, unknown>): OpenOffering | null {
  if (!row.active || !row.bookable || row.hidden) return null;

  const activityId = Number(row.id);
  if (!Number.isFinite(activityId) || activityId <= 0) return null;

  const kind = kindOf(row.category);
  if (!kind) return null;

  const name = str(row.name);
  if (!name) return null;

  const openSpots = num(row.open_spots);
  // Sold out is not "open". The catalog leaves the row active because there
  // is a waitlist, but a family reading "register" should not find a full week.
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
