import { formatDate } from "@/lib/format";

/**
 * Reading back the slice of a call a child will miss.
 *
 * Tony, 23 Aug 2026: "Date Missed and then start time and end time — for
 * example, maybe they are arriving late… only mark the times you will not be
 * present." So the times describe the ABSENCE, not the rehearsal, and a report
 * with no times is the whole call rather than a report missing its times.
 *
 * Shared by the family's own receipt, the director's email and the admin list
 * so the three cannot describe the same absence three different ways.
 */
export interface AbsenceWindow {
  startsOn: string;
  endsOn: string;
  startsAtTime?: string;
  endsAtTime?: string;
}

/**
 * "19:00" → "7:00 PM".
 *
 * Deliberately not formatTime: what is stored is a wall-clock time with no
 * date and no zone, and pushing it through a UTC instant would shift it by
 * however far Leesburg is from Greenwich that week.
 */
export function formatClock(value: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return value;
  const suffix = hours < 12 ? "AM" : "PM";
  const clock = hours % 12 === 0 ? 12 : hours % 12;
  return `${clock}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** The date, then whichever end of the window the parent gave us. */
export function describeAbsenceWindow(window: AbsenceWindow): string {
  const date =
    window.endsOn && window.endsOn !== window.startsOn
      ? `${formatDate(`${window.startsOn}T12:00:00Z`)} – ${formatDate(`${window.endsOn}T12:00:00Z`)}`
      : formatDate(`${window.startsOn}T12:00:00Z`);

  const from = window.startsAtTime ? formatClock(window.startsAtTime) : "";
  const to = window.endsAtTime ? formatClock(window.endsAtTime) : "";

  if (from && to) return `${date}, ${from} – ${to}`;
  if (from) return `${date}, from ${from}`;
  if (to) return `${date}, until ${to}`;
  return `${date} — the whole call`;
}
