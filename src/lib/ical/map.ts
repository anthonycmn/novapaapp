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
 * The show calendar writes its event descriptions as small HTML documents.
 * Flatten one to plain lines, so the rest of this file can read it.
 */
export function descriptionLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<\/?(b|i|strong|em|u|span|div|p)[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export interface CalledList {
  /** Character names called, in the calendar's own order. */
  called: string[];
  /** How many of the company are called, when the calendar states it. */
  calledCount?: number;
  companyCount?: number;
  /** True when the calendar explicitly says nobody is called. */
  nobodyCalled: boolean;
}

/**
 * Who is called to this call.
 *
 * The calendar states it twice: once per room block ("CALLED (5): …") and once
 * as a whole-event summary after an <hr> ("CALLED — 12 of 12:"). The summary
 * wins, because a two-room rehearsal has two block lists and the family cares
 * whether their child is called to the *event*.
 *
 * Character names are split on the middle dot the calendar uses. Splitting on
 * commas instead would tear "Colton Sorenson, Director" and half the role
 * names in the show apart.
 */
export function calledFrom(description: string): CalledList {
  const lines = descriptionLines(description);
  const empty: CalledList = { called: [], nobodyCalled: false };
  if (lines.length === 0) return empty;

  const hr = lines.indexOf("---");
  const summary = hr >= 0 ? lines.slice(hr + 1) : [];

  // Preferred: the summary footer's "CALLED — 12 of 12:" and the line under it.
  for (let i = 0; i < summary.length; i++) {
    const header = summary[i].match(/^CALLED\s*[—–-]\s*(\d+)\s*of\s*(\d+)\s*:?\s*(.*)$/i);
    if (!header) continue;
    const inline = header[3].trim();
    const names = splitNames(inline || summary[i + 1] || "");
    return {
      called: names,
      calledCount: Number(header[1]),
      companyCount: Number(header[2]),
      nobodyCalled: Number(header[1]) === 0,
    };
  }

  // Fallback: per-block "CALLED (5): …" lines, merged and de-duplicated.
  const merged: string[] = [];
  let sawNoStudentCall = false;
  for (const line of lines) {
    const block = line.match(/^CALLED\s*(?:\(\d+\))?\s*:\s*(.+)$/i);
    if (!block) continue;
    const value = block[1].trim();
    if (/^no student call$/i.test(value) || /^nobody/i.test(value)) {
      sawNoStudentCall = true;
      continue;
    }
    for (const name of splitNames(value)) {
      if (!merged.includes(name)) merged.push(name);
    }
  }
  if (merged.length > 0) return { called: merged, nobodyCalled: false };
  return { ...empty, nobodyCalled: sawNoStudentCall };
}

function splitNames(value: string): string[] {
  return value
    .split(/\s*[·•]\s*/)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !/^nobody\b/i.test(name));
}

/** A one-line "called" summary for the row, or undefined when unknown. */
export function calledNoteFor(description: string): string | undefined {
  const { called, nobodyCalled } = calledFrom(description);
  if (nobodyCalled && called.length === 0) return "No student call";
  if (called.length === 0) return undefined;
  return called.join(" · ");
}

/**
 * What this call actually works — the calendar's Scene and Music lines.
 *
 * A parent reading "Rehearsal — Rm A / Rm B" learns nothing; the same event
 * saying "Act I Sc. 1, 2, 5, 8, 9 · No Place Like London; The Worst Pies in
 * London" tells them whether tonight is their child's material.
 */
export function worksNoteFor(description: string): string | undefined {
  const parts: string[] = [];
  for (const line of descriptionLines(description)) {
    const match = line.match(/^(Scene|Music)\s*:\s*(.+)$/i);
    if (!match) continue;
    const value = match[2].trim();
    if (value && !parts.includes(value)) parts.push(value);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

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
    called_note: calledNoteFor(event.description ?? "") ?? null,
    works_note: worksNoteFor(event.description ?? "") ?? null,
    production_id: feed.productionId,
    external_source: feed.key,
    external_ref: event.uid,
  };
}

/**
 * Turn a call sheet — "Sweeney Todd · Mrs. Lovett · Toby · Ensemble" — into
 * the role ids the family calendar filters on.
 *
 * called_note and role_ids MUST be derived together. The note is re-read from
 * the feed every hour, so if Tony changes who is called and only the prose
 * moved, families would be filtered against yesterday's cast.
 *
 * Matching is exact, then whole-word prefix ("Anthony" → Anthony Hope) and
 * suffix ("Pirelli" → Adolfo Pirelli); anything sharing no word with its role
 * needs an alias on the feed.
 *
 * Returns NULL — meaning "show this to everyone" — when the note is empty, or
 * when ANY token fails to resolve. A note we only half understand is the one
 * case where guessing costs a child their call, so we stop filtering instead.
 */
export function roleIdsFromCalledNote(
  calledNote: unknown,
  roles: ReadonlyArray<Record<string, unknown>>,
  aliases: Record<string, string> = {}
): string[] | null {
  const note = String(calledNote ?? "").trim();
  if (!note) return null;

  const ids = new Set<string>();
  for (const raw of note.split("·")) {
    const token = raw.trim();
    if (!token) continue;
    const want = (aliases[token] ?? token).toLowerCase();
    const hit = roles.find((role) => {
      const name = String(role.name ?? "").toLowerCase();
      return name === want || name.startsWith(`${want} `) || name.endsWith(` ${want}`);
    });
    if (!hit) return null;
    ids.add(String(hit.id));
  }
  return ids.size > 0 ? [...ids] : null;
}
