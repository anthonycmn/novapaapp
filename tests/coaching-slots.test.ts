import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import {
  generateSlots,
  slotsByDay,
  type AvailabilityWindow,
  type BusyInterval,
} from "@/lib/api/coaching/slots";

/**
 * Turning a coach's weekly hours into times a parent can press.
 *
 * The rules that matter are the ones nobody notices until they are wrong: a
 * slot offered inside the notice period, a slot offered on top of somebody
 * else's lesson, and — the one that only breaks twice a year — a 4pm window
 * that quietly becomes 3pm when the clocks change.
 */

const easternTime = (iso: string) =>
  formatInTimeZone(new Date(iso), "America/New_York", "yyyy-MM-dd HH:mm");

/** Mondays, 3pm to 8pm Eastern. */
const mondays: AvailabilityWindow[] = [
  { weekday: 1, startsAt: "15:00:00", endsAt: "20:00:00" },
];

const rules = { sessionMinutes: 60, noticeHours: 24, horizonDays: 42 };

/** A Wednesday, comfortably inside daylight time. */
const wed = new Date("2026-08-05T12:00:00Z");

describe("generateSlots", () => {
  it("offers one slot per session length inside the window", () => {
    const slots = generateSlots(mondays, [], rules, wed);
    const firstMonday = slots.filter((s) => easternTime(s).startsWith("2026-08-10"));
    // 15:00, 16:00, 17:00, 18:00, 19:00 — the 19:00 ends exactly at close.
    expect(firstMonday.map(easternTime)).toEqual([
      "2026-08-10 15:00",
      "2026-08-10 16:00",
      "2026-08-10 17:00",
      "2026-08-10 18:00",
      "2026-08-10 19:00",
    ]);
  });

  it("never offers a slot that would run past the window's close", () => {
    const slots = generateSlots(mondays, [], { ...rules, sessionMinutes: 90 }, wed);
    const times = slots.filter((s) => easternTime(s).startsWith("2026-08-10")).map(easternTime);
    // Slots step by one session length, so 15:00, 16:30, 18:00. The next would
    // start at 19:30 and run to 21:00, an hour past the close, so it is absent.
    expect(times).toEqual(["2026-08-10 15:00", "2026-08-10 16:30", "2026-08-10 18:00"]);
  });

  it("can offer starts closer together than one session", () => {
    // A half-hour step lets 18:30 be offered, because 18:30 + 90 lands exactly
    // on the close. This is the knob that decides how tightly a day packs.
    const slots = generateSlots(
      mondays,
      [],
      { ...rules, sessionMinutes: 90, stepMinutes: 30 },
      wed
    );
    const times = slots.filter((s) => easternTime(s).startsWith("2026-08-10")).map(easternTime);
    expect(times[times.length - 1]).toBe("2026-08-10 18:30");
  });

  it("respects the notice period", () => {
    // Standing on the Monday itself at 09:00 Eastern, with 24 hours' notice,
    // that afternoon is already too soon.
    const mondayMorning = new Date("2026-08-10T13:00:00Z");
    const slots = generateSlots(mondays, [], rules, mondayMorning);
    expect(slots.filter((s) => easternTime(s).startsWith("2026-08-10"))).toEqual([]);
    expect(easternTime(slots[0])).toBe("2026-08-17 15:00");
  });

  it("stops at the horizon", () => {
    const slots = generateSlots(mondays, [], { ...rules, horizonDays: 10 }, wed);
    // Only the Monday within ten days survives; the one after does not.
    const days = new Set(slots.map((s) => easternTime(s).slice(0, 10)));
    expect([...days]).toEqual(["2026-08-10"]);
  });

  it("removes slots that overlap something already booked", () => {
    const busy: BusyInterval[] = [
      // 16:00–17:00 Eastern on the first Monday.
      { startsAt: "2026-08-10T20:00:00Z", durationMin: 60 },
    ];
    const times = generateSlots(mondays, busy, rules, wed)
      .filter((s) => easternTime(s).startsWith("2026-08-10"))
      .map(easternTime);
    expect(times).not.toContain("2026-08-10 16:00");
    expect(times).toContain("2026-08-10 15:00");
    expect(times).toContain("2026-08-10 17:00");
  });

  it("treats touching intervals as free, not as a clash", () => {
    // A lesson ending exactly at 16:00 must not block the 16:00 slot.
    const busy: BusyInterval[] = [
      { startsAt: "2026-08-10T19:00:00Z", durationMin: 60 }, // 15:00–16:00
    ];
    const times = generateSlots(mondays, busy, rules, wed)
      .filter((s) => easternTime(s).startsWith("2026-08-10"))
      .map(easternTime);
    expect(times).toContain("2026-08-10 16:00");
    expect(times).not.toContain("2026-08-10 15:00");
  });

  it("keeps a 3pm window at 3pm across the end of daylight saving", () => {
    // Clocks go back on Sunday 1 November 2026. The Mondays either side must
    // both still open at 15:00 Eastern, even though their UTC offsets differ.
    const lateOctober = new Date("2026-10-21T12:00:00Z");
    const slots = generateSlots(mondays, [], rules, lateOctober);
    const opens = slotsByDay(slots).map((day) => easternTime(day.slots[0]));
    expect(opens).toContain("2026-10-26 15:00"); // still daylight time
    expect(opens).toContain("2026-11-02 15:00"); // standard time
    // ...and the two really are different offsets, so this test has teeth.
    const before = slots.find((s) => easternTime(s) === "2026-10-26 15:00")!;
    const after = slots.find((s) => easternTime(s) === "2026-11-02 15:00")!;
    expect(before.slice(11, 16)).toBe("19:00"); // 15:00 EDT = 19:00Z
    expect(after.slice(11, 16)).toBe("20:00"); // 15:00 EST = 20:00Z
  });

  it("returns nothing when the coach has set no hours", () => {
    expect(generateSlots([], [], rules, wed)).toEqual([]);
  });

  it("ignores a malformed or inside-out window rather than throwing", () => {
    const bad: AvailabilityWindow[] = [
      { weekday: 1, startsAt: "nonsense", endsAt: "20:00:00" },
      { weekday: 1, startsAt: "20:00:00", endsAt: "15:00:00" },
    ];
    expect(generateSlots(bad, [], rules, wed)).toEqual([]);
  });

  it("does not offer the same instant twice when windows overlap", () => {
    const overlapping: AvailabilityWindow[] = [
      { weekday: 1, startsAt: "15:00:00", endsAt: "18:00:00" },
      { weekday: 1, startsAt: "16:00:00", endsAt: "20:00:00" },
    ];
    const slots = generateSlots(overlapping, [], rules, wed);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe("slotsByDay", () => {
  it("groups by the Eastern calendar day, in order", () => {
    const days = slotsByDay(generateSlots(mondays, [], rules, wed));
    expect(days[0].date).toBe("2026-08-10");
    expect(days[0].label).toBe("Monday 10 August");
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());
  });
});
