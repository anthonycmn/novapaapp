import { describe, expect, it } from "vitest";
import {
  groupOfferings,
  isSuppressedFromSignup,
  kindOf,
  offeringFromRow,
  SUPPRESSED_FROM_SIGNUP,
  type OpenOffering,
} from "@/lib/api/catalog/offerings";

/**
 * What a family can sign up for, read from the org's own catalogue. The bar
 * here is that everything offered can actually be bought — a dashboard tile
 * that sends a parent to a camp that filled last week is worse than one that
 * says nothing.
 */

/**
 * A row exactly as public.catalog_list() returns one.
 *
 * The function filters on active and hidden itself, so its rows carry neither.
 * `remaining` is its own arithmetic, capacity - sold - booked_offline - held,
 * clamped at zero and null when the offering has no capacity. `open_spots` is
 * still in the result set and is deliberately ignored: it is hand maintained
 * and was wrong on nearly half the catalogue on 18 Sep 2026.
 */
const row = (patch: Record<string, unknown> = {}) => ({
  id: 1962613,
  category: "camp",
  name: "Ages 5–9 Day Camp · Nov 11, 2026",
  age_range: "5 – 9 yrs",
  price_cents: 7900,
  remaining: 40,
  open_spots: 40,
  pdp_url: "/nova-performing-arts/schedules/activity-set/1962613",
  bookable: true,
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
    // catalog_list() applies active and hidden before it returns, so in
    // production only bookable arrives. Both are still honoured here so a
    // direct read of activities cannot quietly lose the other two.
    expect(offeringFromRow(row({ active: false }))).toBeNull();
    expect(offeringFromRow(row({ bookable: false }))).toBeNull();
    expect(offeringFromRow(row({ hidden: true }))).toBeNull();
  });

  it("does not offer a session that is full", () => {
    // The catalogue keeps a sold-out row active because there is a waitlist.
    // "Register" is the wrong word for a full week. catalog_list() clamps at
    // zero, so zero is what an oversold production looks like here.
    expect(offeringFromRow(row({ remaining: 0 }))).toBeNull();
    expect(offeringFromRow(row({ remaining: -3 }))).toBeNull();
  });

  it("still offers one whose places are simply not tracked", () => {
    const offering = offeringFromRow(row({ remaining: null }));
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

describe("what the office has pulled off the sign-up card", () => {
  /*
   * CJ, 18 Sep 2026: "don't advertise any of Frozen programs anymore for sign
   * ups." All three Frozen rows were active, bookable and not hidden when he
   * said it, so the catalogue flags alone would still have offered them.
   */
  it("offers no Frozen programme, whatever the catalogue says", () => {
    for (const name of [
      "Broadway Bound | Frozen, Kids",
      "Broadway Bound Junior | Frozen, Jr.",
      "Broadway Bound Teens | Frozen, Jr",
      "A Day at the Theatre - \"A Frozen Adventure\"",
    ]) {
      expect(
        offeringFromRow(row({ name, active: true, bookable: true, hidden: false })),
        `${name} is still being advertised`
      ).toBeNull();
    }
  });

  it("matches however the catalogue capitalises it", () => {
    expect(isSuppressedFromSignup("FROZEN, JR.")).toBe(true);
    expect(isSuppressedFromSignup("frozen kids")).toBe(true);
  });

  it("leaves everything else alone", () => {
    expect(isSuppressedFromSignup("Sweeney Todd - Teen Conservatory")).toBe(false);
    expect(isSuppressedFromSignup("Musical Theatre Acting")).toBe(false);
    expect(offeringFromRow(row({ name: "Hadestown - Teen Conservatory" }))).not.toBeNull();
  });

  it("is a list the office can empty to put them back", () => {
    expect(SUPPRESSED_FROM_SIGNUP.length).toBeGreaterThan(0);
  });
});

describe("how many places are left", () => {
  /*
   * The guard used to read activities.open_spots, a hand-maintained column. On
   * 18 Sep 2026 it was right on 54 of 102 sellable rows, 29 rows claimed more
   * places than the offering had seats, and it read 663 for a Frozen Jr
   * production that had one left. catalog_list() computes the number instead.
   */
  it("believes remaining, not open_spots", () => {
    const oversold = offeringFromRow(row({ remaining: 0, open_spots: 663 }));
    expect(oversold, "a full offering was advertised because open_spots said otherwise").toBeNull();
  });

  it("still offers a row that open_spots calls full but the checkout does not", () => {
    const offering = offeringFromRow(row({ remaining: 6, open_spots: 0 }));
    expect(offering?.openSpots).toBe(6);
  });

  it("reports the checkout's number, so \"places left\" is the truth", () => {
    expect(offeringFromRow(row({ remaining: 1, open_spots: 663 }))?.openSpots).toBe(1);
  });

  it("offers an uncapped offering, which is most coaching", () => {
    const offering = offeringFromRow(row({ category: "coaching", remaining: null }));
    expect(offering).not.toBeNull();
    expect(offering?.openSpots).toBeUndefined();
  });

  it("drops anything the registration window has closed", () => {
    // catalog_list() folds registration_opens_at and registration_closes_at
    // into bookable, which the old direct read ignored entirely.
    expect(offeringFromRow(row({ bookable: false }))).toBeNull();
  });

  it("still honours active and hidden if handed a raw activities row", () => {
    expect(offeringFromRow(row({ active: false }))).toBeNull();
    expect(offeringFromRow(row({ hidden: true }))).toBeNull();
  });
});
