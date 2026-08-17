import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { org } from "@/config/org";
import type { IcalFeed } from "@/config/ical-feeds";
import type { IcalEvent } from "@/lib/ical/parse";

/**
 * Turning one VEVENT into one calendar_events row.
 *
 * Kept apart from the sync itself so it carries no database import, which
 * means these rules — the ones with the sharp edges — are unit-testable.
 */
/**
 * Performances are what families buy tickets for and plan around, so they are
 * typed differently from calls. "No rehearsal" markers are neither.
 */
export function eventTypeFor(summary: string): string {
  const s = summary.toLowerCase();
  if (/no rehearsal|no call|off book deadline/.test(s)) return "other";
  if (/opening night|matinee|closing performance|performance/.test(s)) return "performance";
  if (/\bevening\b/.test(s) && /curtain/.test(s)) return "performance";
  if (/tech|cue to cue|dry tech|wet tech/.test(s)) return "tech";
  if (/photo|headshot/.test(s)) return "photo_call";
  if (/fitting|costume measure/.test(s)) return "fitting";
  return "rehearsal";
}

export function cleanTitle(summary: string, prefix?: RegExp): string {
  const stripped = prefix ? summary.replace(prefix, "").trim() : summary.trim();
  return stripped || summary;
}

/**
 * The calendar states the call time inside the title — "(call 12:30, curtain
 * 2:00)". Surface it as a real field so the rail can say "be there by".
 *
 * Read as a wall-clock time on the event's own local date, NOT as an offset
 * from the event start. Deriving it by subtracting (curtain − call) from the
 * start assumes the calendar block begins at curtain, and on these matinees it
 * begins at the CALL — which put "be there by" ninety minutes early, i.e. it
 * would have sent families to an empty theatre at 11am for a 12:30 call.
 *
 * Both times are on a 12-hour clock and every performance is afternoon or
 * evening, so an hour under 8 means PM.
 */
export function callTimeFor(summary: string, startIso: string): string | null {
  const call = summary.match(/call\s*(\d{1,2}):(\d{2})/i);
  if (!call) return null;
  const pm = (h: number) => (h < 8 ? h + 12 : h);
  const hours = pm(Number(call[1]));
  const minutes = Number(call[2]);
  if (hours > 23 || minutes > 59) return null;

  const localDate = formatInTimeZone(new Date(startIso), org.timeZone, "yyyy-MM-dd");
  const stamp = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const callAt = fromZonedTime(`${localDate}T${stamp}:00`, org.timeZone);
  if (Number.isNaN(callAt.getTime())) return null;

  // A call must land on the day of the event and no later than its start.
  const start = new Date(startIso).getTime();
  if (callAt.getTime() > start) return null;
  if (start - callAt.getTime() > 12 * 60 * 60_000) return null;
  return callAt.toISOString();
}

export function rowFor(event: IcalEvent, feed: IcalFeed) {
  return {
    type: eventTypeFor(event.summary),
    title: cleanTitle(event.summary, feed.titlePrefix),
    starts_at: event.start,
    ends_at: event.end,
    call_time: callTimeFor(event.summary, event.start),
    location: event.location ?? "",
    production_id: feed.productionId,
    external_source: feed.key,
    external_ref: event.uid,
  };
}
