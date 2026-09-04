/**
 * Performance times, read from novapa.org rather than made up.
 *
 * CJ, 4 Sep 2026: "I dont want you to invent anything - I want it to pull the
 * information from novapa.org."
 *
 * WHAT WAS WRONG. The schedule bridge had no performance times to work from —
 * the staff portal records `perf_days: 3` and a date range, nothing more — so
 * it generated one show per calendar day at a hard-coded 19:00 and titled it
 * "(time TBA)". For Frozen KIDS that produced Friday, Saturday and Sunday at
 * 7pm. The truth, published on novapa.org all along, is Friday 7pm and
 * Saturday at 2pm AND 7pm: three performances across two days, one of them a
 * matinee — a shape the generated version could not express at all.
 *
 * WHERE THE TRUTH LIVES. Every show card on the website carries a "Curtains"
 * row, hand-written by the people who set the schedule:
 *
 *   Jan 22 7pm · Jan 23 2pm & 7pm
 *   Oct 23 7pm · Oct 24 2pm & 7pm · Oct 25 2pm · Oct 30 7pm · Oct 31 2pm · Nov 1 2pm
 *   Jul 17 11am, 1pm, 4pm & 7pm
 *
 * That row is the single source: the site is static HTML with no build step, so
 * there is no feed behind it to read instead, and a second copy kept in the
 * portal would be a second thing to forget to update. Sweeney's row already
 * agrees exactly with the seven rows in public.tix_performances, which is the
 * best evidence available that it is maintained.
 *
 * FAILING IS BETTER THAN GUESSING. Every function here returns nothing rather
 * than something approximate. A row it cannot parse yields no performances at
 * all, and the caller leaves the calendar alone — because the failure this
 * whole module exists to prevent is a confident wrong time, and a family who
 * arrives at 7 for a 2 o'clock curtain is worse off than one who was told
 * nothing.
 */

/** One curtain: the moment the show starts. */
export interface Curtain {
  /** Local wall-clock date, YYYY-MM-DD. */
  date: string;
  /** Local wall-clock time, HH:MM (24h). */
  time: string;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** "7pm" → "19:00", "11am" → "11:00", "2:30pm" → "14:30". */
function toTime(raw: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(raw.trim());
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3].toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (meridiem === "pm" && hour !== 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Parse one "Curtains" row into individual performances.
 *
 * `seasonYear` is the year the run belongs to; a row that crosses New Year —
 * "Dec 30 7pm · Jan 2 2pm" — rolls forward, because a January date after a
 * December one in the same row is the next year rather than eleven months ago.
 *
 * Returns [] for anything it does not fully understand. Partial credit is not
 * on offer: half a run silently missing its matinees is a worse artefact than
 * no run at all, because it looks complete.
 */
export function parseCurtains(row: string, seasonYear: number): Curtain[] {
  const text = row
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;|&mdash;/g, "-")
    .trim();
  if (!text) return [];

  const out: Curtain[] = [];
  let year = seasonYear;
  let previousMonth = 0;

  for (const group of text.split("·")) {
    const chunk = group.trim();
    if (!chunk) continue;

    // "Jan 23 2pm & 7pm" → month, day, then everything after as times.
    const head = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})\s+(.*)$/.exec(chunk);
    if (!head) return [];

    const month = MONTHS[head[1].slice(0, 3).toLowerCase()];
    const day = Number(head[2]);
    if (!month || day < 1 || day > 31) return [];

    // A month earlier than the last one means the run crossed into a new year.
    if (previousMonth && month < previousMonth) year += 1;
    previousMonth = month;

    const times = head[3]
      .split(/,|&|\band\b/i)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!times.length) return [];

    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const raw of times) {
      const time = toTime(raw);
      if (!time) return [];
      out.push({ date, time });
    }
  }

  return out;
}

/**
 * Pull every show card's curtains out of a novapa.org page.
 *
 * Matched off the "Curtains" label rather than a class name or a position,
 * because the label is the part a person maintaining the page is thinking
 * about; the wrapper markup around it has already been restyled twice.
 *
 * The name is read from the card's <h3 class="pgm-name"> above the row, which
 * is what a family sees the show called.
 */
export function extractCurtainRows(html: string): Array<{ name: string; row: string }> {
  const out: Array<{ name: string; row: string }> = [];
  const cards = html.split(/<article[^>]*class="[^"]*pgm-card/i).slice(1);

  for (const card of cards) {
    const name = /<h3[^>]*class="[^"]*pgm-name[^"]*"[^>]*>([\s\S]*?)<\/h3>/i.exec(card);
    const row = /<span>Curtains<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i.exec(card);
    if (!name || !row) continue;
    out.push({
      name: decodeEntities(name[1]).replace(/\s+/g, " ").trim(),
      row: decodeEntities(row[1]).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&rsquo;|&#8217;/g, "’")
    .replace(/&middot;/g, "·")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}
