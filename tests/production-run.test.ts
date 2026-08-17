import { describe, expect, it } from "vitest";
import {
  daysUntil,
  describeRun,
  openingNight,
  runFromEvents,
} from "@/lib/api/productions/run";

/**
 * All twenty-four productions on record carry a null `opens_on`: runs are
 * scheduled in the staff portal and arrive as calendar events, so the column
 * is never written. Reading it alone is why the shows list said "dates to be
 * confirmed" for a Sweeney Todd with seven performances from 23 October.
 */

const format = (iso: string) => iso.slice(0, 10);

const run = (dates: string[]) =>
  runFromEvents(dates.map((startsAt) => ({ type: "performance" as const, startsAt })));

describe("summarising a run", () => {
  it("takes the first and last performance", () => {
    const summary = run([
      "2026-10-25T23:00:00.000Z",
      "2026-10-23T23:00:00.000Z",
      "2026-11-01T20:30:00.000Z",
    ]);
    expect(summary.firstPerformanceAt).toBe("2026-10-23T23:00:00.000Z");
    expect(summary.lastPerformanceAt).toBe("2026-11-01T20:30:00.000Z");
    expect(summary.performanceCount).toBe(3);
  });

  it("counts performances only — a rehearsal is not a show", () => {
    const summary = runFromEvents([
      { type: "rehearsal", startsAt: "2026-08-24T23:00:00.000Z" },
      { type: "tech", startsAt: "2026-10-18T22:00:00.000Z" },
      { type: "performance", startsAt: "2026-10-23T23:00:00.000Z" },
    ]);
    expect(summary.performanceCount).toBe(1);
    expect(summary.firstPerformanceAt).toBe("2026-10-23T23:00:00.000Z");
  });

  it("reports nothing for a show with no performances yet", () => {
    const summary = runFromEvents([
      { type: "rehearsal", startsAt: "2026-08-24T23:00:00.000Z" },
    ]);
    expect(summary.performanceCount).toBe(0);
    expect(summary.firstPerformanceAt).toBeUndefined();
  });
});

describe("opening night", () => {
  it("falls back to the calendar when the column is null — the real case", () => {
    expect(openingNight({ opensOn: undefined }, run(["2026-10-23T23:00:00.000Z"]))).toBe(
      "2026-10-23T23:00:00.000Z"
    );
  });

  it("prefers a typed-in date when somebody has set one", () => {
    expect(
      openingNight({ opensOn: "2026-10-20" }, run(["2026-10-23T23:00:00.000Z"]))
    ).toBe("2026-10-20T12:00:00Z");
  });

  it("reads a date-only column at midday, so no zone moves it a day", () => {
    // Midnight would land on the 19th in America/New_York.
    expect(openingNight({ opensOn: "2026-10-20" })).toBe("2026-10-20T12:00:00Z");
  });

  it("is null only when there is genuinely nothing", () => {
    expect(openingNight({ opensOn: undefined }, undefined)).toBeNull();
    expect(openingNight({ opensOn: undefined }, run([]))).toBeNull();
  });
});

describe("counting down", () => {
  const now = Date.parse("2026-08-17T12:00:00.000Z");

  it("counts whole days to opening", () => {
    expect(daysUntil("2026-08-24T23:00:00.000Z", now)).toBe(8);
  });

  it("goes negative once the run has started", () => {
    expect(daysUntil("2026-08-10T23:00:00.000Z", now)).toBe(-6);
  });

  it("has no answer when there is no date", () => {
    expect(daysUntil(null, now)).toBeNull();
  });
});

describe("what a parent reads under the title", () => {
  it("dates a show that has a run, rather than shrugging", () => {
    // The bug, in one assertion.
    expect(
      describeRun({ opensOn: undefined }, run(["2027-03-05T23:00:00.000Z"]), format)
    ).toBe("Opens 2027-03-05");
  });

  it("still says 'to be confirmed' when nothing is scheduled", () => {
    // Eleven of the twenty-four really are unconfirmed, and saying so is
    // right — it is saying it about Sweeney that teaches families to
    // distrust the page.
    expect(describeRun({ opensOn: undefined }, undefined, format)).toBe(
      "Dates to be confirmed"
    );
    expect(describeRun({ opensOn: undefined }, run([]), format)).toBe(
      "Dates to be confirmed"
    );
  });

  it("speaks in the past about a run that has been and gone", () => {
    expect(describeRun({ opensOn: "2020-01-01" }, run([]), format)).toBe(
      "Opened 2020-01-01"
    );
    expect(
      describeRun({ opensOn: undefined }, run(["2020-01-01T20:00:00.000Z"]), format)
    ).toBe("Ran from 2020-01-01");
  });
});
