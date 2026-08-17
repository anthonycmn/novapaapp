import { describe, expect, it } from "vitest";
import {
  addDays,
  buildWeek,
  orgDayKey,
  weekLabel,
  weekStart,
  weekdayLabel,
  weeksFromNow,
} from "@/lib/calendar/week";
import { pickForDay } from "@/components/dashboard/panels";

/**
 * The org runs on America/New_York and stores UTC. Those disagree about what
 * day it is every evening, which is exactly when rehearsals happen — so most
 * of what follows is about not putting Monday's call on Tuesday.
 */

describe("which day a call falls on", () => {
  it("reads an evening call as the evening it is", () => {
    // 8:00pm Monday 17 Aug in Virginia is 00:00 Tuesday in UTC.
    expect(orgDayKey("2026-08-18T00:00:00.000Z")).toBe("2026-08-17");
    // 11:59pm Monday, still Monday.
    expect(orgDayKey("2026-08-18T03:59:00.000Z")).toBe("2026-08-17");
    // 12:01am Tuesday really is Tuesday.
    expect(orgDayKey("2026-08-18T04:01:00.000Z")).toBe("2026-08-18");
  });

  it("handles winter, when the offset is an hour different", () => {
    // EST is UTC-5, so the same wall-clock evening lands an hour later in UTC.
    expect(orgDayKey("2026-01-13T00:30:00.000Z")).toBe("2026-01-12");
    expect(orgDayKey("2026-01-13T05:30:00.000Z")).toBe("2026-01-13");
  });

  it("reads a morning call the obvious way", () => {
    expect(orgDayKey("2026-08-17T12:30:00.000Z")).toBe("2026-08-17");
  });
});

describe("moving around the calendar", () => {
  it("adds days across a month end", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("adds days across a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("does not drift across a DST change", () => {
    // The clocks go back on 1 Nov 2026. Seven days is still seven days,
    // because a day key has no hour in it to lose.
    expect(addDays("2026-10-28", 7)).toBe("2026-11-04");
  });
});

describe("the week a day belongs to", () => {
  it("starts on Monday", () => {
    // 19 Aug 2026 is a Wednesday.
    expect(weekStart("2026-08-19")).toBe("2026-08-17");
    expect(weekdayLabel("2026-08-17")).toBe("Mon");
  });

  it("puts Sunday at the END of its week, not the start of the next", () => {
    // A show's closing matinee belongs to the week that rehearsed it.
    expect(weekStart("2026-08-23")).toBe("2026-08-17");
    expect(weekdayLabel("2026-08-23")).toBe("Sun");
  });

  it("is idempotent on a Monday", () => {
    expect(weekStart("2026-08-17")).toBe("2026-08-17");
  });

  it("labels a week, and says both months when it straddles two", () => {
    expect(weekLabel("2026-08-19")).toBe("17 – 23 Aug");
    expect(weekLabel("2026-10-01")).toBe("28 Sep – 4 Oct");
  });

  it("counts weeks from now so the header can say where you are", () => {
    expect(weeksFromNow("2026-08-19", "2026-08-17")).toBe(0);
    expect(weeksFromNow("2026-08-24", "2026-08-19")).toBe(1);
    expect(weeksFromNow("2026-08-10", "2026-08-19")).toBe(-1);
    // Anywhere in the same week is still this week.
    expect(weeksFromNow("2026-08-23", "2026-08-17")).toBe(0);
  });
});

describe("building the week a parent reads", () => {
  const events = [
    { id: "a", startsAt: "2026-08-18T00:00:00.000Z" }, // Mon 8pm
    { id: "b", startsAt: "2026-08-17T18:00:00.000Z" }, // Mon 2pm
    { id: "c", startsAt: "2026-08-21T22:00:00.000Z" }, // Fri 6pm
    { id: "d", startsAt: "2026-09-01T18:00:00.000Z" }, // a fortnight later
  ];

  it("returns seven days, Monday first", () => {
    const week = buildWeek(events, "2026-08-19", "2026-08-19");
    expect(week).toHaveLength(7);
    expect(week[0].dayKey).toBe("2026-08-17");
    expect(week[6].dayKey).toBe("2026-08-23");
  });

  it("keeps the empty days, because the gaps are the answer", () => {
    const week = buildWeek(events, "2026-08-19", "2026-08-19");
    expect(week.map((d) => d.events.length)).toEqual([2, 0, 0, 0, 1, 0, 0]);
  });

  it("orders a day's calls by when they start", () => {
    const monday = buildWeek(events, "2026-08-19", "2026-08-19")[0];
    // 2pm before 8pm — and the 8pm one is a UTC Tuesday, so this also proves
    // it was bucketed by the evening a parent is driving to it.
    expect(monday.events.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("leaves out anything from another week", () => {
    const week = buildWeek(events, "2026-08-19", "2026-08-19");
    expect(week.flatMap((d) => d.events).map((e) => e.id)).not.toContain("d");
  });

  it("marks today, and only today", () => {
    const week = buildWeek(events, "2026-08-19", "2026-08-19");
    expect(week.filter((d) => d.isToday).map((d) => d.dayKey)).toEqual(["2026-08-19"]);
  });

  it("marks no day at all when you are looking at another week", () => {
    const week = buildWeek(events, "2026-09-02", "2026-08-19");
    expect(week.some((d) => d.isToday)).toBe(false);
  });

  it("copes with a family that has nothing on", () => {
    const week = buildWeek([], "2026-08-19", "2026-08-19");
    expect(week).toHaveLength(7);
    expect(week.every((d) => d.events.length === 0)).toBe(true);
  });
});

describe("the colleague of the day", () => {
  it("is the same person all day, for everybody", () => {
    const team = ["Katie", "Jen", "Todd"];
    expect(pickForDay(team, "2026-08-17")).toBe(pickForDay(team, "2026-08-17"));
  });

  it("works through the whole team before anybody repeats", () => {
    const team = ["Katie", "Jen", "Todd", "Jason"];
    const week = ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20"].map((day) =>
      pickForDay(team, day)
    );
    expect(new Set(week).size).toBe(4);
    // ...and then comes round again rather than stopping.
    expect(pickForDay(team, "2026-08-21")).toBe(week[0]);
  });

  it("has nobody to show when nobody is published", () => {
    expect(pickForDay([], "2026-08-17")).toBeUndefined();
  });
});
