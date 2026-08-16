import { describe, expect, it } from "vitest";
import { org } from "@/config/org";
import { QUOTES, quoteOfTheDay } from "@/lib/quotes";

describe("mission", () => {
  it("keeps the ACT inside impACTing", () => {
    // Any well-meaning tidy-up of this string breaks the whole point of it.
    expect(org.mission).toBe("impACTing Lives One Story At a Time");
  });
});

describe("quote of the day", () => {
  it("gives every family the same quote on the same day", () => {
    const morning = new Date("2026-08-16T13:00:00Z"); // 9am ET
    const evening = new Date("2026-08-16T23:30:00Z"); // 7:30pm ET
    expect(quoteOfTheDay(morning)).toEqual(quoteOfTheDay(evening));
  });

  it("changes at local midnight, not at UTC midnight", () => {
    // 8pm ET on the 16th and 1am ET on the 17th are 5 hours apart but land on
    // either side of UTC midnight. The first two must match; the third differs.
    const eveningEt = new Date("2026-08-17T00:00:00Z"); // 8pm ET, Aug 16
    const lateEveningEt = new Date("2026-08-17T03:00:00Z"); // 11pm ET, Aug 16
    const nextDayEt = new Date("2026-08-17T05:00:00Z"); // 1am ET, Aug 17

    expect(quoteOfTheDay(eveningEt)).toEqual(quoteOfTheDay(lateEveningEt));
    expect(quoteOfTheDay(nextDayEt)).not.toEqual(quoteOfTheDay(eveningEt));
    expect(org.timeZone).toBe("America/New_York");
  });

  it("walks the list in order, so consecutive days never repeat", () => {
    const day = 86_400_000;
    const start = new Date("2026-09-01T16:00:00Z").getTime();
    const seen = Array.from({ length: QUOTES.length }, (_, i) =>
      quoteOfTheDay(new Date(start + i * day)).text
    );
    expect(new Set(seen).size).toBe(QUOTES.length);
  });

  it("cycles rather than running out", () => {
    const day = 86_400_000;
    const base = new Date("2026-09-01T16:00:00Z").getTime();
    const afterOneCycle = new Date(base + QUOTES.length * day);
    expect(quoteOfTheDay(afterOneCycle)).toEqual(quoteOfTheDay(new Date(base)));
  });

  it("has enough lines that a family does not see a repeat within a season", () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(42);
  });

  it("never ships an empty or unattributed-but-quoted line", () => {
    for (const quote of QUOTES) {
      expect(quote.text.trim().length).toBeGreaterThan(0);
      if (quote.author !== undefined) {
        expect(quote.author.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
