/**
 * A small RFC5545 reader — only the parts a Google Calendar feed uses.
 *
 * This lives in src/lib rather than in a script because two callers need the
 * same answer: the hourly sync job and the one-shot import script. Two copies
 * of a date parser is two sets of timezone bugs.
 */

export interface IcalEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: string;
  end: string;
  allDay: boolean;
}

/** Unfold continuation lines (a leading space continues the previous line). */
export function unfold(ics: string): string[] {
  const out: string[] = [];
  for (const raw of ics.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

export function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/**
 * "20261023T213000Z" → ISO instant. "20260907" (all-day) → 16:00Z, i.e. local
 * noon, so the event lands on the right calendar day in America/New_York
 * without dragging in a timezone library.
 */
export function toIso(value: string, allDay: boolean): string {
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  if (allDay) return `${y}-${m}-${d}T16:00:00.000Z`;
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  const ss = value.slice(13, 15) || "00";
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`;
}

export function parseIcal(ics: string): IcalEvent[] {
  const lines = unfold(ics);
  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = { location: "", description: "" };
    else if (line === "END:VEVENT") {
      if (current?.uid && current.summary && current.start && current.end) {
        events.push(current as IcalEvent);
      }
      current = null;
    } else if (current) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const nameAndParams = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const name = nameAndParams.split(";")[0].toUpperCase();
      const isDateOnly = /VALUE=DATE(?!-TIME)/i.test(nameAndParams);

      if (name === "UID") current.uid = value.trim();
      else if (name === "SUMMARY") current.summary = unescapeText(value);
      else if (name === "LOCATION") current.location = unescapeText(value);
      else if (name === "DESCRIPTION") current.description = unescapeText(value);
      else if (name === "DTSTART") {
        current.allDay = isDateOnly;
        current.start = toIso(value.trim(), isDateOnly);
      } else if (name === "DTEND") {
        current.end = toIso(value.trim(), isDateOnly);
      }
    }
  }
  return events;
}
