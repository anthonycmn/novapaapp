/**
 * Private lessons: weekly recurring slots with the same teacher (org
 * policy — lessons are semester-style standing appointments, not one-off
 * bookings). A slot is a teacher + weekday + time; a booking attaches one
 * student to that slot until cancelled.
 *
 * Payment is "billed by the studio" until Stripe keys arrive
 * (NEEDS-FROM-TONY #3) — the booking flow is identical either way.
 */

export type LessonDiscipline = "voice" | "acting" | "dance";

export const LESSON_DISCIPLINES: Array<{
  value: LessonDiscipline;
  label: string;
  emoji: string;
}> = [
  { value: "voice", label: "Voice", emoji: "🎤" },
  { value: "acting", label: "Acting", emoji: "🎭" },
  { value: "dance", label: "Dance", emoji: "🩰" },
];

export interface LessonSlot {
  id: string;
  /** StaffProfile id of the teacher — same teacher every week. */
  teacherStaffId: string;
  discipline: LessonDiscipline;
  /** 0 = Sunday … 6 = Saturday, studio-local (Eastern). */
  weekday: number;
  /** "16:30" studio-local (Eastern). */
  startTime: string;
  durationMin: number;
  location: string;
  pricePerLessonCents: number;
}

export interface LessonBooking {
  id: string;
  slotId: string;
  studentId: string;
  familyId: string;
  /** YYYY-MM-DD of the first lesson (the next occurrence at booking time). */
  startDate: string;
  status: "active" | "cancelled";
  /** Optional: what the family wants the lessons to work toward. */
  goals?: string;
  /** Stripe checkout replaces this when keys arrive. */
  paymentMethod: "studio_invoice";
  createdAt: string;
  cancelledAt?: string;
}

export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** How many upcoming lessons appear on the family calendar. */
export const LESSON_CALENDAR_WEEKS = 4;

/**
 * Eastern offset used across the seed data (EDT). Real timezone handling
 * arrives with the Supabase build; keeping the same convention as every
 * other seeded event avoids mixed-offset bugs in the meantime.
 */
const ET_OFFSET_MS = 4 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * First occurrence of a weekly slot at or after `afterMs` (UTC epoch ms).
 */
export function nextLessonOccurrence(
  slot: Pick<LessonSlot, "weekday" | "startTime">,
  afterMs: number
): number {
  const [hours, minutes] = slot.startTime.split(":").map(Number);
  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    // The calendar date in Eastern time, dayOffset days from `afterMs`.
    const easternDay = new Date(afterMs - ET_OFFSET_MS + dayOffset * DAY_MS);
    if (easternDay.getUTCDay() !== slot.weekday) continue;
    const candidate =
      Date.UTC(
        easternDay.getUTCFullYear(),
        easternDay.getUTCMonth(),
        easternDay.getUTCDate(),
        hours,
        minutes
      ) + ET_OFFSET_MS;
    if (candidate >= afterMs) return candidate;
  }
  // The weekday 7 days out always matches; this line is unreachable but
  // keeps the return type honest.
  return afterMs;
}

/** The next `count` weekly occurrences at or after `afterMs`. */
export function upcomingLessonOccurrences(
  slot: Pick<LessonSlot, "weekday" | "startTime">,
  afterMs: number,
  count: number
): number[] {
  const first = nextLessonOccurrence(slot, afterMs);
  return Array.from({ length: count }, (_, week) => first + week * 7 * DAY_MS);
}
