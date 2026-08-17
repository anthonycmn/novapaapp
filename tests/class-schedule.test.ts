import { describe, expect, it } from "vitest";
import { classSchedule, formatLocalTime } from "@/lib/api/catalog/class-schedule";

/**
 * A class stores its day as a number and its time as "16:30". Neither is
 * anything to put in front of a parent, and the failure mode of getting it
 * wrong is somebody arriving on the wrong evening.
 */

describe("a local time", () => {
  it("reads the afternoon the way a parent says it", () => {
    expect(formatLocalTime("16:30")).toBe("4:30 PM");
    expect(formatLocalTime("09:00")).toBe("9:00 AM");
    expect(formatLocalTime("9:05")).toBe("9:05 AM");
  });

  it("gets the two times everybody gets wrong right", () => {
    expect(formatLocalTime("00:15")).toBe("12:15 AM");
    expect(formatLocalTime("12:00")).toBe("12:00 PM");
  });

  it("handles a stored seconds component", () => {
    expect(formatLocalTime("18:45:00")).toBe("6:45 PM");
  });

  it("hands back anything it cannot read rather than inventing a time", () => {
    expect(formatLocalTime("evenings")).toBe("evenings");
    expect(formatLocalTime("")).toBe("");
    expect(formatLocalTime("25:00")).toBe("25:00");
    expect(formatLocalTime("10:75")).toBe("10:75");
  });
});

describe("when a class meets", () => {
  it("reads as a sentence", () => {
    expect(
      classSchedule({ dayOfWeek: 2, startTime: "16:30", endTime: "17:30" })
    ).toBe("Tuesdays · 4:30 PM – 5:30 PM");
  });

  it("uses the plural, because a class is a standing commitment", () => {
    expect(classSchedule({ dayOfWeek: 0, startTime: "10:00", endTime: "11:00" })).toBe(
      "Sundays · 10:00 AM – 11:00 AM"
    );
    expect(classSchedule({ dayOfWeek: 6, startTime: "10:00", endTime: "11:00" })).toBe(
      "Saturdays · 10:00 AM – 11:00 AM"
    );
  });

  it("says the time alone rather than 'undefined' when the day is missing", () => {
    expect(classSchedule({ dayOfWeek: 9, startTime: "16:30", endTime: "17:30" })).toBe(
      "4:30 PM – 5:30 PM"
    );
  });

  it("says the day alone when there are no times on record", () => {
    expect(classSchedule({ dayOfWeek: 3, startTime: "", endTime: "" })).toBe("Wednesdays");
  });
});
