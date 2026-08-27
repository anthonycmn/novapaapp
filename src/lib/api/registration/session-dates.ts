/**
 * When a session actually runs, read out of the website catalog.
 *
 * The dates arrive as display strings on `activities.class_times`, e.g.
 *
 *   "Jul 19, 2027 - Jul 30, 2027"   a two-week camp
 *   "Nov 9, 2026"                    a single day camp
 *   "Nov 16, 2026 - Mar 21, 2027"    a conservatory running across a new year
 *
 * They are meant for a human reading a product page, so this parser is
 * deliberately strict: anything it does not fully understand returns null and
 * the caller falls back to the tax-year range. These dates end up on a
 * Dependent Care FSA statement, and a date that is confidently wrong is worse
 * than one that is honestly vague.
 */

export interface SessionDates {
  startsOn: string; // yyyy-mm-dd
  endsOn: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "Jul 19, 2027" → "2027-07-19". Null when it is not a date we recognize. */
export function parseCatalogDate(text: string): string | null {
  const match = text
    .trim()
    .match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (!match) return null;

  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;

  // Reject a day that does not exist in that month — "Feb 30, 2027" is a
  // typo upstream, not a date, and Date() would silently roll it to March.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (asDate.getUTCMonth() !== month - 1 || asDate.getUTCDate() !== day) return null;

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A whole "product_detail_date" string → first and last day of care.
 *
 * A single date means a one-day session, so both ends are that day: a camp on
 * 9 November is care provided on 9 November, not care with no end.
 */
export function parseSessionDates(text: string | undefined | null): SessionDates | null {
  if (!text) return null;

  // Split on a dash surrounded by space, so "Jul 19, 2027 - Jul 30, 2027"
  // divides but "Nov 9, 2026" and any hyphenated month name survive.
  const parts = text.split(/\s+[-–—]\s+/).map((part) => part.trim()).filter(Boolean);

  if (parts.length === 1) {
    const day = parseCatalogDate(parts[0]);
    return day ? { startsOn: day, endsOn: day } : null;
  }
  if (parts.length !== 2) return null;

  const startsOn = parseCatalogDate(parts[0]);
  const endsOn = parseCatalogDate(parts[1]);
  if (!startsOn || !endsOn) return null;
  // A range that runs backwards is a parse we got wrong, not a session.
  if (endsOn < startsOn) return null;

  return { startsOn, endsOn };
}

/** The first usable date range on an activity's class_times. */
export function sessionDatesFromClassTimes(classTimes: unknown): SessionDates | null {
  if (!Array.isArray(classTimes)) return null;
  for (const entry of classTimes) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const text =
      typeof row.product_detail_date === "string"
        ? row.product_detail_date
        : typeof row.secondary_text === "string"
          ? row.secondary_text
          : undefined;
    const parsed = parseSessionDates(text);
    if (parsed) return parsed;
  }
  return null;
}
