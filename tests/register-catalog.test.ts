import { describe, expect, it } from "vitest";
import { buildCatalog, matches, parseAges, toCard, type CatalogRow, type Filters } from "@/lib/registration/catalog-view";

const row = (o: Partial<CatalogRow>): CatalogRow => ({
  id: 1, category: "class", name: "Tap", schedule_name: "Winter Classes | Nov 3 – Mar 30",
  age_range: "7 – 11 yrs", pricing: ["$90/mo"], price_cents: 9000, image_url: null, bookable: true,
  remaining: 5, class_times: [{ title_text: "Tue" }], description: "Rhythm.", offering_kind: "class",
  starts_on: "2026-11-03", ends_on: "2027-03-30", ...o,
});
const none: Filters = { kinds: [], age: null, days: [], q: "" };

describe("register catalog", () => {
  it("reads ages in the house styles", () => {
    expect(parseAges("9 – 12 yrs")).toEqual({ min: 9, max: 12 });
    expect(parseAges("7+ yrs")).toEqual({ min: 7, max: null });
    expect(parseAges("up to 6 yrs")).toEqual({ min: null, max: 6 });
    expect(parseAges(null)).toEqual({ min: null, max: null });
  });

  it("makes a card: label, when, days, price", () => {
    const c = toCard(row({}));
    expect(c).toMatchObject({ kind: "class", isClass: true, label: "Winter Classes", when: "Nov 3 – Mar 30", days: ["Tue"], priceLabel: "$90/mo", status: "open" });
  });

  it("full, and not yet open", () => {
    expect(toCard(row({ remaining: 0 })).status).toBe("full");
    expect(toCard(row({ bookable: false })).status).toBe("closed");
  });

  it("filters by kind, age, day and words", () => {
    const c = toCard(row({}));
    expect(matches(c, none)).toBe(true);
    expect(matches(c, { ...none, kinds: ["show"] })).toBe(false);
    expect(matches(c, { ...none, age: 12 })).toBe(false);
    expect(matches(c, { ...none, age: 8 })).toBe(true);
    expect(matches(c, { ...none, days: ["Wed"] })).toBe(false);
    expect(matches(c, { ...none, days: ["Tue"] })).toBe(true);
    expect(matches(c, { ...none, q: "rhythm" })).toBe(true);
  });

  it("keeps summer seat-grid camps on the old checkout, and puts open things first", () => {
    const cards = buildCatalog([
      row({ id: 2, name: "Zumba", remaining: 0 }),
      row({ id: 3, category: "camp", offering_kind: null, name: "Broadway Bound | How to Train Your Dragon JR." }),
      row({ id: 4, name: "Acting" }),
    ]);
    expect(cards.map((c) => c.id)).toEqual([4, 2]);
  });
});
