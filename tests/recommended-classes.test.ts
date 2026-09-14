import { describe, expect, it } from "vitest";
import {
  recommendedClassesFrom,
  recommendedLessonsFrom,
  type AuditionEvaluation,
} from "@/lib/api/auditions/types";
import { meets } from "@/app/(app)/casting/recommended-next";

/**
 * "Classes we recommend to help you improve" (hub 0085): what the staff
 * portal ticks on a rubric is stored as a snapshot, and the family reads it
 * with the day and time each class meets.
 */

const tuesday = {
  classId: "c-mtd",
  activityId: 1960925,
  name: "Musical Theatre Dance",
  ages: "13-17",
  dayOfWeek: 2,
  startsAt: "19:00",
  endsAt: "19:50",
};

describe("reading a rubric's recommendations back", () => {
  it("keeps a well-formed class and coerces a stringy activity id", () => {
    expect(recommendedClassesFrom([{ ...tuesday, activityId: "1960925" }])).toEqual([tuesday]);
  });

  it("drops rows that could not be rendered honestly", () => {
    expect(
      recommendedClassesFrom([
        { ...tuesday, name: "" },
        { ...tuesday, dayOfWeek: 7 },
        null,
        "Acting",
      ])
    ).toEqual([]);
  });

  it("treats a class with no listing as recommendable but not buyable", () => {
    expect(recommendedClassesFrom([{ ...tuesday, activityId: null }])[0].activityId).toBeNull();
    expect(recommendedClassesFrom([{ ...tuesday, activityId: 0 }])[0].activityId).toBeNull();
  });

  it("accepts only the four lesson kinds", () => {
    expect(recommendedLessonsFrom(["voice", "tap", "musical_theatre", 3])).toEqual([
      "voice",
      "musical_theatre",
    ]);
    expect(recommendedLessonsFrom(null)).toEqual([]);
  });

  it("survives an evaluation saved before 0085", () => {
    const old = { recommendedClasses: undefined, recommendedLessons: undefined } as unknown as Pick<
      AuditionEvaluation,
      "recommendedClasses" | "recommendedLessons"
    >;
    expect(recommendedClassesFrom(old.recommendedClasses)).toEqual([]);
    expect(recommendedLessonsFrom(old.recommendedLessons)).toEqual([]);
  });
});

describe("the day and time a parent reads", () => {
  it("names the weekday and the range", () => {
    expect(meets(tuesday)).toBe("Tuesdays, 7:00 pm–7:50 pm");
    expect(meets({ ...tuesday, dayOfWeek: 6, startsAt: "12:00", endsAt: "12:50" })).toBe(
      "Saturdays, 12:00 pm–12:50 pm"
    );
    expect(meets({ ...tuesday, dayOfWeek: 1, startsAt: "09:30:00", endsAt: "10:15:00" })).toBe(
      "Mondays, 9:30 am–10:15 am"
    );
  });
});
