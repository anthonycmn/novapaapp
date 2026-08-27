import type { CalendarEvent, Production } from "../types";

/**
 * When a show actually opens.
 *
 * NOT `production.opensOn`. As of 17 Aug 2026 every one of the twenty-four
 * productions on record has that column null, because runs are scheduled in
 * the staff portal and land in `calendar_events` — the production row is
 * created by the bridge and never carries a date. Reading the column alone is
 * why the shows list and the dashboard both said "dates to be confirmed" for
 * Sweeney, which has seven performances from 23 October.
 *
 * So the column is a hint, not the answer: it wins when somebody has typed a
 * date in, and the calendar answers otherwise. The production detail page had
 * this right and the two newer pages did not, which is the argument for it
 * living in one place instead of three.
 */

export interface ProductionRun {
  /** First performance, ISO. Undefined when nothing is scheduled yet. */
  firstPerformanceAt?: string;
  lastPerformanceAt?: string;
  performanceCount: number;
}

/**
 * Opening night as an ISO instant, or null when genuinely unknown.
 *
 * `opensOn` is a date with no time, so it is read at midday UTC — the same
 * convention the rest of the app uses for date-only columns, and far enough
 * from either midnight that no timezone turns it into the day before.
 */
export function openingNight(
  production: Pick<Production, "opensOn">,
  run?: ProductionRun
): string | null {
  if (production.opensOn) return `${production.opensOn}T12:00:00Z`;
  return run?.firstPerformanceAt ?? null;
}

/** Whole days until opening. Negative once the run is under way. */
export function daysUntil(openingAt: string | null, now: number = Date.now()): number | null {
  if (!openingAt) return null;
  return Math.ceil((new Date(openingAt).getTime() - now) / 86_400_000);
}

/** Summarize a set of calendar events into one show's run. */
export function runFromEvents(events: Array<Pick<CalendarEvent, "type" | "startsAt">>): ProductionRun {
  const performances = events
    .filter((event) => event.type === "performance")
    .map((event) => event.startsAt)
    .sort();
  return {
    firstPerformanceAt: performances[0],
    lastPerformanceAt: performances.at(-1),
    performanceCount: performances.length,
  };
}

/**
 * The line under a show's title: when it opens, or the honest absence of one.
 *
 * "Dates to be confirmed" is reserved for shows with genuinely nothing
 * scheduled — eleven of the twenty-four, which are next season's and really
 * are unconfirmed. Saying it about a show with a full run on the calendar
 * teaches families not to believe the page.
 */
export function describeRun(
  production: Pick<Production, "opensOn">,
  run: ProductionRun | undefined,
  formatDate: (iso: string) => string
): string {
  const opening = openingNight(production, run);
  if (!opening) return "Dates to be confirmed";
  const days = daysUntil(opening);
  if (days !== null && days < 0) {
    return run && run.performanceCount > 0
      ? `Ran from ${formatDate(opening)}`
      : `Opened ${formatDate(opening)}`;
  }
  return `Opens ${formatDate(opening)}`;
}
