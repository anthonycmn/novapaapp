import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";

/**
 * Bucketing a family's calendar into the week they actually live in.
 *
 * Every timestamp in this app is UTC, and every parent reads it in Virginia.
 * Those disagree about what day it is for four hours every evening: a 8:00pm
 * Monday rehearsal is 00:00 Tuesday in UTC. Bucket by the UTC date and a
 * quarter of the calls in a show week land on the wrong row — worst on the
 * evenings, which is when rehearsals are.
 *
 * So the day a thing happens on is computed in the org's zone, and the rest of
 * this module works on "yyyy-MM-dd" strings. Date arithmetic on those is exact:
 * there is no zone left in them to get wrong, and no DST hour to lose.
 */

/** The calendar day an instant falls on, as a parent would say it. */
export function orgDayKey(isoUtc: string): string {
  return formatInTimeZone(new Date(isoUtc), org.timeZone, "yyyy-MM-dd");
}

/** Today, in the org's zone. */
export function todayKey(now: Date = new Date()): string {
  return formatInTimeZone(now, org.timeZone, "yyyy-MM-dd");
}

/** Day of week for a key: 0 = Sunday, matching Date.getUTCDay. */
export function dayOfWeek(dayKey: string): number {
  return new Date(`${dayKey}T00:00:00Z`).getUTCDay();
}

/** Shift a day key by whole days. Exact — the key carries no zone. */
export function addDays(dayKey: string, days: number): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The Monday of the week a day falls in.
 *
 * Monday rather than Sunday because that is how a rehearsal week reads: the
 * weekend at the end of it is the run, not the start of the next one.
 */
export function weekStart(dayKey: string): string {
  const dow = dayOfWeek(dayKey);
  return addDays(dayKey, dow === 0 ? -6 : 1 - dow);
}

export interface WeekDay<E> {
  dayKey: string;
  /** 0 = Sunday. */
  dayOfWeek: number;
  isToday: boolean;
  events: E[];
}

/**
 * Seven days, Monday first, each with the events that fall on it.
 *
 * Empty days are kept rather than dropped. A week with Tuesday and Thursday
 * missing is a different thing to read than a list of two rehearsals — the
 * gaps are the information a parent is looking for when they ask "what have we
 * got on".
 */
export function buildWeek<E extends { startsAt: string }>(
  events: E[],
  anchorDayKey: string,
  today: string = todayKey()
): Array<WeekDay<E>> {
  const monday = weekStart(anchorDayKey);
  const byDay = new Map<string, E[]>();
  for (const event of events) {
    const key = orgDayKey(event.startsAt);
    const list = byDay.get(key) ?? [];
    list.push(event);
    byDay.set(key, list);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const dayKey = addDays(monday, index);
    return {
      dayKey,
      dayOfWeek: dayOfWeek(dayKey),
      isToday: dayKey === today,
      events: (byDay.get(dayKey) ?? []).sort((a, b) =>
        a.startsAt.localeCompare(b.startsAt)
      ),
    };
  });
}

/** "Mon", "Tue"… for a day key, without dragging a Date through a zone. */
const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function weekdayLabel(dayKey: string): string {
  return WEEKDAY[dayOfWeek(dayKey)];
}

const MONTH = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "17" — the day number alone, for a calendar cell. */
export function dayNumber(dayKey: string): string {
  return String(Number(dayKey.slice(8, 10)));
}

/** "18 – 24 Aug", or "29 Sep – 5 Oct" when the week straddles two months. */
export function weekLabel(anchorDayKey: string): string {
  const monday = weekStart(anchorDayKey);
  const sunday = addDays(monday, 6);
  const startMonth = MONTH[Number(monday.slice(5, 7)) - 1];
  const endMonth = MONTH[Number(sunday.slice(5, 7)) - 1];
  const from = dayNumber(monday);
  const to = dayNumber(sunday);
  return startMonth === endMonth
    ? `${from} – ${to} ${endMonth}`
    : `${from} ${startMonth} – ${to} ${endMonth}`;
}

/**
 * How far off a week is, in weeks, so the header can say "This week" rather
 * than making a parent compare two dates to work out where they are.
 */
export function weeksFromNow(anchorDayKey: string, today: string = todayKey()): number {
  const from = new Date(`${weekStart(today)}T00:00:00Z`).getTime();
  const to = new Date(`${weekStart(anchorDayKey)}T00:00:00Z`).getTime();
  return Math.round((to - from) / (7 * 86_400_000));
}
