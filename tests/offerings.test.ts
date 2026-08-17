import { describe, expect, it } from "vitest";
import {
  groupOfferings,
  kindOf,
  offeringFromRow,
  type OpenOffering,
} from "@/lib/api/catalog/offerings";

/**
 * What a family can sign up for, read from the org's own catalogue. The bar
 * here is that everything offered can actually be bought — a dashboard tile
 * that sends a parent to a camp that filled last week is worse than one that
 * says nothing.
 */

/** A row exactly as public.activities returns one. */
const row = (patch: Record<string, unknown> = {}) => ({
  id: 1962613,
  category: "camp",
  name: "Ages 5–9 Day Camp · Nov 11, 2026",
  age_range: "5 – 9 yrs",
  price_cents: 7900,
  open_spots: 40,
  pdp_url: "/nova-performing-arts/schedules/activity-set/1962613",
  active: true,
  bookable: true,
  hidden: false,
  ...patch,
});

describe("the catalogue's categories in a parent's words", () => {
  it("reads the four the catalogue actually uses", () => {
    expect(kindOf("class")).toBe("class");
    expect(kindOf("camp")).toBe("camp");
    expect(kindOf("coaching")).toBe("lesson");
    expect(kindOf("performance")).toBe("show");
    expect(kindOf("CAMP")).toBe("camp");
  });

  it("does not guess at one it has never seen", () => {
    expect(kindOf("workshop")).toBeNull();
    expect(kindOf(null)).toBeNull();
    expect(kindOf("")).toBeNull();
  });
});

describe("reading one offering", () => {
  it("reads the real shape", () => {
    expect(offeringFromRow(row())).toEqual({
      activityId: 1962613,
      kind: "camp",
      name: "Ages 5–9 Day Camp · Nov 11, 2026",
      ageRange: "5 – 9 yrs",
      priceCents: 7900,
      openSpots: 40,
      registerUrl:
        "https://www.northernvirginiaperformingarts.org/register/?activity=1962613",
    });
  });

  it("books through the org's own site, never the old Sawyer path", () => {
    // config/registration.ts: a family sent to Sawyer lands on an account that
    // knows nothing about the balance this app is showing them.
    const offering = offeringFromRow(row())!;
    expect(offering.registerUrl).not.toContain("hisawyer");
    expect(offering.registerUrl).not.toContain("activity-set");
  });

  it("respects the three flags the office sets", () => {
    expect(offeringFromRow(row({ active: false }))).toBeNull();
    expect(offeringFromRow(row({ bookable: false }))).toBeNull();
    expect(offeringFromRow(row({ hidden: true }))).toBeNull();
  });

  it("does not offer a session that is full", () => {
    // The catalogue keeps a sold-out row active because there is a waitlist.
    // "Register" is the wrong word for a full week.
    expect(offeringFromRow(row({ open_spots: 0 }))).toBeNull();
    expect(offeringFromRow(row({ open_spots: -3 }))).toBeNull();
  });

  it("still offers one whose places are simply not tracked", () => {
    const offering = offeringFromRow(row({ open_spots: null }));
    expect(offering?.openSpots).toBeUndefined();
    expect(offering?.activityId).toBe(1962613);
  });

  it("refuses a row it cannot build a link from", () => {
    expect(offeringFromRow(row({ id: null }))).toBeNull();
    expect(offeringFromRow(row({ id: 0 }))).toBeNull();
    expect(offeringFromRow(row({ name: "  " }))).toBeNull();
    expect(offeringFromRow(row({ category: "something new" }))).toBeNull();
  });

  it("tidies the whitespace the catalogue carries", () => {
    // Several real rows end in trailing spaces — "Broadway Bound | Trolls Jr.  "
    expect(offeringFromRow(row({ name: "  Broadway Bound |  Trolls Jr.  " }))?.name).toBe(
      "Broadway Bound | Trolls Jr."
    );
  });
});

describe("grouping them for a dashboard", () => {
  const many = (kind: string, n: number, from = 1): OpenOffering[] =>
    Array.from({ length: n }, (_, i) =>
      offeringFromRow(
        row({ id: from + i, category: kind, name: `${kind} ${i}`, price_cents: (i + 1) * 100 })
      )!
    );

  it("keeps the catalogue's own order of kinds, not the alphabet", () => {
    const grouped = groupOfferings([...many("coaching", 1, 900), ...many("class", 1, 100)]);
    expect(grouped.map((g) => g.kind)).toEqual(["class", "lesson"]);
  });

  it("counts what it cut rather than hiding it", () => {
    // 124 rows are open; a dashboard is not a shop. What is left out has to be
    // sayable, or the card quietly pretends the rest do not exist.
    const grouped = groupOfferings(many("camp", 10), 3);
    expect(grouped[0].shown).toHaveLength(3);
    expect(grouped[0].more).toBe(7);
  });

  it("opens with something approachable rather than a $995 musical", () => {
    const grouped = groupOfferings(many("class", 3), 3);
    expect(grouped[0].shown.map((o) => o.priceCents)).toEqual([100, 200, 300]);
  });

  it("sorts an unpriced offering last rather than treating it as free", () => {
    const priced = offeringFromRow(row({ id: 1, category: "class", name: "B", price_cents: 5000 }))!;
    const unpriced = offeringFromRow(row({ id: 2, category: "class", name: "A", price_cents: null }))!;
    expect(groupOfferings([unpriced, priced])[0].shown.map((o) => o.name)).toEqual(["B", "A"]);
  });

  it("says nothing at all when nothing is open", () => {
    expect(groupOfferings([])).toEqual([]);
  });
});
