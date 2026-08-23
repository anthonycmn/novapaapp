import { describe, expect, it } from "vitest";
import {
  COACHING_REFERENCE_PREFIX,
  isCoachingReference,
  offerFromRow,
} from "@/lib/api/coaching/offers";

/**
 * The two pure decisions on the money path.
 *
 * Coaching packages and spirit-button orders are sold through ONE Stripe
 * endpoint and told apart by their reference prefix. Getting that wrong is not
 * a cosmetic bug: a store order routed to coaching would credit somebody
 * sessions they never bought, and a coaching purchase routed to the store
 * would take a parent's money and never credit anything.
 *
 * The other decision is reading the price list. PostgREST hands back numeric
 * columns as strings, so the dollars-to-cents conversion is real arithmetic on
 * a value that arrives untyped.
 */

describe("isCoachingReference", () => {
  it("claims coaching references", () => {
    expect(isCoachingReference("COACH-1")).toBe(true);
    expect(isCoachingReference("COACH-4821")).toBe(true);
  });

  it("leaves store orders alone", () => {
    // family_hub.next_order_reference issues these.
    expect(isCoachingReference("NPA-1")).toBe(false);
    expect(isCoachingReference("NPA-4821")).toBe(false);
  });

  it("rejects the bare prefix with no number after it", () => {
    // A malformed callback must be ignored, not sent down the crediting path.
    expect(isCoachingReference(COACHING_REFERENCE_PREFIX)).toBe(false);
  });

  it("is not fooled by a prefix appearing later in the string", () => {
    expect(isCoachingReference("NPA-COACH-7")).toBe(false);
    expect(isCoachingReference("")).toBe(false);
  });

  it("is case sensitive, matching what the database issues", () => {
    expect(isCoachingReference("coach-7")).toBe(false);
  });
});

const row = (patch: Record<string, unknown> = {}) => ({
  menu_id: "menu-1",
  service: "3-Pack Acting Coaching Sessions",
  category: "Coaching Services",
  // PostgREST returns numeric as a string — this is the realistic shape.
  price: "350.00",
  sessions: 3,
  ...patch,
});

describe("offerFromRow", () => {
  it("reads a price list row, converting dollars to cents", () => {
    const offer = offerFromRow(row())!;
    expect(offer.priceCents).toBe(35000);
    expect(offer.sessions).toBe(3);
    expect(offer.service).toBe("3-Pack Acting Coaching Sessions");
  });

  it("converts a price with awkward cents without drifting", () => {
    // 219.00 and 1297.00 are real menu prices; floating point must not turn
    // either into 21899 or 129699.
    expect(offerFromRow(row({ price: "219.00" }))!.priceCents).toBe(21900);
    expect(offerFromRow(row({ price: "1297.00" }))!.priceCents).toBe(129700);
    expect(offerFromRow(row({ price: "1050.00" }))!.priceCents).toBe(105000);
  });

  it("drops a row with no session count", () => {
    // A service rather than a package. The view already excludes these; this
    // is the second lock on the same door.
    expect(offerFromRow(row({ sessions: null }))).toBeNull();
    expect(offerFromRow(row({ sessions: 0 }))).toBeNull();
  });

  it("drops a row with a nonsense price rather than charging it", () => {
    expect(offerFromRow(row({ price: null }))).toBeNull();
    expect(offerFromRow(row({ price: "0" }))).toBeNull();
    expect(offerFromRow(row({ price: "not a price" }))).toBeNull();
    expect(offerFromRow(row({ price: "-50" }))).toBeNull();
  });

  it("drops a row with no id, which could not be bought anyway", () => {
    expect(offerFromRow(row({ menu_id: null }))).toBeNull();
  });

  it("falls back to a sane name rather than showing 'undefined'", () => {
    expect(offerFromRow(row({ service: null }))!.service).toBe("Coaching sessions");
    expect(offerFromRow(row({ service: "   " }))!.service).toBe("Coaching sessions");
  });
});
