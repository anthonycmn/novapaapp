import type { ClassOffering } from "../types";

/**
 * When a class meets, in the words a parent would use.
 *
 * Pure so it can be tested: `dayOfWeek` is a number and `startTime` is a
 * "16:30" local string, and neither is anything a parent should be shown raw.
 */

const DAYS = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** "4:30 PM" from "16:30". Returns the input unchanged if it is not a time. */
export function formatLocalTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isFinite(hours) || hours > 23 || Number(minutes) > 59) return value;
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

/** "Tuesdays · 4:30 PM – 5:30 PM". */
export function classSchedule(
  offering: Pick<ClassOffering, "dayOfWeek" | "startTime" | "endTime">
): string {
  const day = DAYS[offering.dayOfWeek];
  const times = [offering.startTime, offering.endTime]
    .filter(Boolean)
    .map(formatLocalTime)
    .join(" – ");
  // A class with no day on record says the time alone rather than "undefined".
  return [day, times].filter(Boolean).join(" · ");
}
