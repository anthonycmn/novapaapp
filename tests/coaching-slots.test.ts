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
 *
 * Durations here are fifty and thirty minutes because those are the only two
 * a coaching session comes in (portal 0161). The fifty-minute hour is why the
 * arithmetic is worth testing at all: it does not divide the clock neatly, so
 * every boundary in here is a real edge rather than a round number.
 */

const easternTime = (iso: string) =>
  formatInTimeZone(new Date(iso), "America/New_York", "yyyy-MM-dd HH:mm");

/** Mondays, 3pm to 8pm Eastern. */
const mondays: AvailabilityWindow[] = [
  { weekday: 1, startsAt: "15:00:00", endsAt: "20:00:00" },
];

const rules = { sessionMinutes: 50, noticeHours: 24, horizonDays: 42 };

/** A Wednesday, comfortably inside daylight time. */
const wed = new Date("2026-08-05T12:00:00Z");

const onFirstMonday = (slots: string[]) =>
  slots.filter((s) => easternTime(s).startsWith("2026-08-10")).map(easternTime);

describe("generateSlots", () => {
  it("packs fifty-minute sessions across the window", () => {
    // Five hours divides into exactly six fifty-minute sessions, and the last
    // one ends as the window closes.
    expect(onFirstMonday(generateSlots(mondays, [], rules, wed))).toEqual([
      "2026-08-10 15:00",
      "2026-08-10 15:50",
      "2026-08-10 16:40",
      "2026-08-10 17:30",
      "2026-08-10 18:20",
      "2026-08-10 19:10",
    ]);
  });

  it("never offers a slot that would run past the window's close", () => {
    const times = onFirstMonday(
      generateSlots(mondays, [], { ...rules, sessionMinutes: 30 }, wed)
    );
    // 19:30 + 30 lands exactly on the close; nothing starts after it.
    expect(times[times.length - 1]).toBe("2026-08-10 19:30");
    expect(times).not.toContain("2026-08-10 20:00");
  });

  it("can offer starts closer together than one session", () => {
    // A half-hour step overlaps the offers, which packs a day more tightly.
    // 19:00 + 50 still fits; 19:30 + 50 would not, so it is absent.
    const times = onFirstMonday(
      generateSlots(mondays, [], { ...rules, stepMinutes: 30 }, wed)
    );
    expect(times).toContain("2026-08-10 19:00");
    expect(times).not.toContain("2026-08-10 19:30");
  });

  it("respects the notice period", () => {
    // Standing on the Monday itself at 09:00 Eastern, with 24 hours' notice,
    // that afternoon is already too soon.
    const mondayMorning = new Date("2026-08-10T13:00:00Z");
    const slots = generateSlots(mondays, [], rules, mondayMorning);
    expect(onFirstMonday(slots)).toEqual([]);
    expect(easternTime(slots[0])).toBe("2026-08-17 15:00");
  });

  it("stops at the horizon", () => {
    const slots = generateSlots(mondays, [], { ...rules, horizonDays: 10 }, wed);
    const days = new Set(slots.map((s) => easternTime(s).slice(0, 10)));
    expect([...days]).toEqual(["2026-08-10"]);
  });

  it("removes slots that overlap something already booked", () => {
    const busy: BusyInterval[] = [
      // 16:00–17:00 Eastern on the first Monday.
      { startsAt: "2026-08-10T20:00:00Z", durationMin: 60 },
    ];
    const times = onFirstMonday(generateSlots(mondays, busy, rules, wed));
    // 15:50 runs to 16:40 and 16:40 runs to 17:30 — both collide with it.
    expect(times).not.toContain("2026-08-10 15:50");
    expect(times).not.toContain("2026-08-10 16:40");
    expect(times).toContain("2026-08-10 15:00");
    expect(times).toContain("2026-08-10 17:30");
  });

  it("treats touching intervals as free, not as a clash", () => {
    const busy: BusyInterval[] = [
      // 15:00–15:50 exactly, so the 15:50 slot begins as it ends.
      { startsAt: "2026-08-10T19:00:00Z", durationMin: 50 },
    ];
    const times = onFirstMonday(generateSlots(mondays, busy, rules, wed));
    expect(times).toContain("2026-08-10 15:50");
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

/**
 * Colton's real window, because it is the first question a coach asked.
 *
 * "If he sets his hours to 9am–6pm, is 6pm the last time they can schedule, or
 * 5pm?" Neither: the window is when the coach is AVAILABLE, so a session has
 * to finish inside it rather than start on its edge. With fifty-minute
 * sessions the last one starts at 4:30 and ends at 5:20, and the forty minutes
 * after that are too short to sell.
 *
 * The database enforces the same rule independently — family_book_coaching
 * refuses a booking whose end falls outside the window — so this is pinned on
 * both sides of the bridge.
 */
describe("a nine-to-six window", () => {
  const nineToSix: AvailabilityWindow[] = [
    { weekday: 1, startsAt: "09:00:00", endsAt: "18:00:00" },
  ];

  it("stops offering when a session would run past six", () => {
    const times = onFirstMonday(generateSlots(nineToSix, [], rules, wed));
    expect(times[0]).toBe("2026-08-10 09:00");
    // 16:30 + 50 = 17:20, inside. 17:20 + 50 = 18:10, outside — so 16:30 is
    // the last start and 18:00 is a finishing time, not a starting one.
    expect(times[times.length - 1]).toBe("2026-08-10 16:30");
    expect(times).not.toContain("2026-08-10 17:20");
    expect(times).not.toContain("2026-08-10 18:00");
    expect(times).toHaveLength(10);
  });

  it("reaches 17:30 with half-hour sessions instead", () => {
    // The same window sells one more slot at the short length, and the last
    // one still lands exactly on six.
    const times = onFirstMonday(
      generateSlots(nineToSix, [], { ...rules, sessionMinutes: 30 }, wed)
    );
    expect(times[times.length - 1]).toBe("2026-08-10 17:30");
  });
});
