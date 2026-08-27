import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Turning "Mondays, 3 until 8" into times a parent can actually press.
 *
 * A coach sets weekly windows in Eastern wall-clock (portal 0122): weekday,
 * start, end. A parent needs concrete instants, with the ones already taken
 * removed, the ones too soon removed, and the ones too far out removed.
 *
 * EVERYTHING HERE IS EASTERN, AND THAT IS NOT COSMETIC. The windows are
 * "3pm in Leesburg", not an offset — so a window that runs 15:00–20:00 must
 * still run 15:00–20:00 the week the clocks change. Building instants by
 * adding hours to a UTC number would silently shift every slot by an hour for
 * half the year. `fromZonedTime` resolves each Eastern wall-clock time against
 * the offset in force on THAT date, which is the only thing that survives
 * March and November.
 *
 * The generator is deliberately pure — no clock, no fetch — because the rules
 * it encodes (notice, horizon, overlap, the clocks changing) are exactly the
 * things that are painful to debug in a browser and easy to pin in a test.
 */

export const COACHING_TIME_ZONE = "America/New_York";

/** A weekly window as `v_coaching_availability_public` returns one. */
export interface AvailabilityWindow {
  /** 0 = Sunday, matching Postgres `extract(dow)`. */
  weekday: number;
  /** Eastern wall-clock, "15:00:00". */
  startsAt: string;
  endsAt: string;
}

/** An interval already taken on this coach's diary. Carries no identity. */
export interface BusyInterval {
  /** ISO instant. */
  startsAt: string;
  durationMin: number;
}

export interface SlotRules {
  sessionMinutes: number;
  noticeHours: number;
  horizonDays: number;
  /** How far apart offered starts are. Defaults to one session length. */
  stepMinutes?: number;
}

const MINUTE = 60_000;

/** "15:30:00" → 930. Returns null for anything unparseable. */
function toMinutes(hhmm: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The weekday of a calendar date, 0 = Sunday.
 *
 * Read off a UTC noon instant rather than a local Date, so the answer cannot
 * be dragged across midnight by the machine's own timezone.
 */
function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T12:00:00Z`).getUTCDay();
}

/** The Eastern calendar date, n days after the Eastern date `now` falls on. */
function easternDatePlus(now: Date, days: number): string {
  const base = formatInTimeZone(now, COACHING_TIME_ZONE, "yyyy-MM-dd");
  const shifted = new Date(`${base}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * Every bookable start for one coach, soonest first, as ISO instants.
 *
 * `now` is passed in rather than read, so a test can stand on a Tuesday in
 * November without waiting for one.
 */
export function generateSlots(
  windows: AvailabilityWindow[],
  busy: BusyInterval[],
  rules: SlotRules,
  now: Date
): string[] {
  const session = Math.max(1, Math.trunc(rules.sessionMinutes || 50));
  const step = Math.max(1, Math.trunc(rules.stepMinutes ?? session));
  const earliest = now.getTime() + Math.max(0, rules.noticeHours) * 60 * MINUTE;
  const latest = now.getTime() + Math.max(0, rules.horizonDays) * 24 * 60 * MINUTE;

  // Precomputed as [start, end) milliseconds so the overlap test is arithmetic
  // rather than a date library call per candidate.
  const taken = busy
    .map((interval) => {
      const start = new Date(interval.startsAt).getTime();
      if (Number.isNaN(start)) return null;
      const minutes =
        Number.isFinite(interval.durationMin) && interval.durationMin > 0
          ? interval.durationMin
          : 60;
      return [start, start + minutes * MINUTE] as const;
    })
    .filter((x): x is readonly [number, number] => x !== null);

  const byWeekday = new Map<number, AvailabilityWindow[]>();
  for (const window of windows) {
    const list = byWeekday.get(window.weekday) ?? [];
    list.push(window);
    byWeekday.set(window.weekday, list);
  }
  if (byWeekday.size === 0) return [];

  const slots: string[] = [];
  const seen = new Set<string>();

  // Start at "yesterday" in Eastern so a window running late on the day the
  // horizon opens is not missed by an off-by-one at the boundary.
  for (let day = -1; day <= Math.max(0, rules.horizonDays) + 1; day += 1) {
    const date = easternDatePlus(now, day);
    const todays = byWeekday.get(weekdayOf(date));
    if (!todays) continue;

    for (const window of todays) {
      const open = toMinutes(window.startsAt);
      const close = toMinutes(window.endsAt);
      if (open === null || close === null || close <= open) continue;

      // `<= close - session`: a session may end exactly as the window closes,
      // which is the common case for the last slot of an evening.
      for (let at = open; at <= close - session; at += step) {
        const wall = `${date}T${pad(Math.floor(at / 60))}:${pad(at % 60)}:00`;
        const instant = fromZonedTime(wall, COACHING_TIME_ZONE);
        const ms = instant.getTime();
        if (Number.isNaN(ms) || ms < earliest || ms > latest) continue;

        const end = ms + session * MINUTE;
        if (taken.some(([from, to]) => ms < to && from < end)) continue;

        const iso = instant.toISOString();
        // A repeated window, or the hour that repeats when the clocks go back,
        // must not offer the same instant twice.
        if (seen.has(iso)) continue;
        seen.add(iso);
        slots.push(iso);
      }
    }
  }

  return slots.sort();
}

/** "Mon 4:00 PM", in the only timezone this organization books in. */
export function formatSlot(iso: string): string {
  return formatInTimeZone(new Date(iso), COACHING_TIME_ZONE, "EEE d MMM, h:mm a");
}

/** Group slots by their Eastern calendar date, for a day-by-day picker. */
export function slotsByDay(slots: string[]): Array<{ date: string; label: string; slots: string[] }> {
  const days = new Map<string, string[]>();
  for (const iso of slots) {
    const date = formatInTimeZone(new Date(iso), COACHING_TIME_ZONE, "yyyy-MM-dd");
    days.set(date, [...(days.get(date) ?? []), iso]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      label: formatInTimeZone(
        new Date(`${date}T12:00:00Z`),
        "UTC",
        "EEEE d MMMM"
      ),
      slots: list,
    }));
}
