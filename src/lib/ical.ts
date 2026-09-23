import type { FamilyCalendarEvent } from "@/lib/api/types";
import { org } from "@/config/org";

/**
 * Minimal iCalendar (RFC 5545) generation for the family feed (#5).
 * Times are emitted as UTC (Z) — calendar apps convert to local.
 */

function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function toIcsUtc(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Fold long lines at 75 octets per RFC 5545 §3.1. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

/*
 * The UID namespace. Bumped from "@novapa-family-hub" on 23 Sep 2026: the old
 * DTSTAMP fell back to an event's own start time, so a subscriber's copy of a
 * never-moved rehearsal carried a FUTURE stamp, and every later edit arrived
 * stamped older than the copy it should replace. Jen Travis's Google Calendar
 * held Aubry's Sep 26 call at a time and address the portal had dropped weeks
 * before, through a delete and re-add. New UIDs make every client drop those
 * copies and take the current ones; change it again only for the same reason.
 */
const UID_DOMAIN = "portal.novapa.org";

export function buildFamilyIcs(
  events: FamilyCalendarEvent[],
  options: {
    familyName: string;
    studentNamesById: Record<string, string>;
    /** When the feed was generated. Injected for tests. */
    now?: Date;
  }
): string {
  // RFC 5545 §3.8.7.2: with a METHOD, DTSTAMP is when this calendar object
  // was created — i.e. now — never a date taken from the event itself.
  const stamp = toIcsUtc((options.now ?? new Date()).toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${org.shortName}//Family Hub//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${icsEscape(`${org.shortName} - ${options.familyName}`)}`),
    `X-WR-TIMEZONE:${org.timeZone}`,
    // Without a stated cadence Apple Calendar refreshes subscribed feeds
    // weekly — a Tuesday rehearsal move reached some phones the following
    // Sunday (Sep 5 2026 audit). Both spellings, because clients disagree.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const event of events) {
    const kids = event.studentIds
      .map((id) => options.studentNamesById[id])
      .filter(Boolean)
      .join(", ");
    const descriptionParts = [
      kids && `For: ${kids}`,
      event.callTime && `Call time: ${new Date(event.callTime).toLocaleString("en-US", { timeZone: org.timeZone })}`,
      event.whatToBring && `Bring: ${event.whatToBring}`,
      event.calledNote && `Called: ${event.calledNote}`,
      event.worksNote && `Working: ${event.worksNote}`,
      event.contactName && `Contact: ${event.contactName}${event.contactEmail ? ` <${event.contactEmail}>` : ""}`,
      event.changeNote && `Note: ${event.changeNote}`,
      // The show calendar's own description, so what a family downloads or
      // subscribes to says the same thing the portal and Google do.
      event.details && `\n${event.details.replaceAll("---", "—")}`,
    ].filter(Boolean);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@${UID_DOMAIN}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toIcsUtc(event.startsAt)}`,
      `DTEND:${toIcsUtc(event.endsAt)}`,
      foldLine(`SUMMARY:${icsEscape(kids ? `${event.title} (${kids})` : event.title)}`),
      foldLine(`LOCATION:${icsEscape(event.location)}`),
      ...(descriptionParts.length
        ? [foldLine(`DESCRIPTION:${icsEscape(descriptionParts.join("\n"))}`)]
        : []),
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
