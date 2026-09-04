import "server-only";
import { extractCurtainRows, parseCurtains, type Curtain } from "./curtains";

/**
 * Fetching the published curtain times from novapa.org.
 *
 * CJ, 4 Sep 2026: "I dont want you to invent anything - I want it to pull the
 * information from novapa.org."
 *
 * THE PAGES. Three carry show cards with a Curtains row — the fall season, the
 * summer season and the teen conservatory. Listed rather than crawled: a
 * crawler that discovers a page is a crawler that can discover the wrong one,
 * and these change about once a year.
 *
 * MATCHED BY THE DATE THE RUN OPENS, not by title. The website calls it
 * "Disney's Frozen KIDS" and the portal calls it "Frozen KIDS - Cast A (Ages
 * 5-9)"; any rule that tried to reconcile those two strings would be a pile of
 * special cases that breaks the first time somebody renames a show. The date a
 * run opens is a fact both systems already agree on and neither is guessing at,
 * so it is the key — and if the two disagree, nothing matches and nothing is
 * written, which is the correct outcome rather than a near miss.
 *
 * THE YEAR COMES FROM THE PORTAL. The website writes "Jan 22", not "Jan 22
 * 2027". Rather than infer a year from the month — which is how a May show
 * lands eleven months from where it belongs — each row is parsed against the
 * year of the portal's own opening date, and only kept if the first curtain
 * then lands exactly on it.
 */

const SEASON_PAGES = [
  "https://novapa.org/broadway-bound",
  "https://novapa.org/summer-2027",
  "https://novapa.org/teen-conservatory",
] as const;

export interface PublishedRun {
  /** The show as the website names it, for the log. */
  name: string;
  /** The row verbatim, so a failure to parse can be read by a person. */
  row: string;
  curtains: Curtain[];
}

/**
 * Every show card the website publishes a Curtains row for, parsed against a
 * given year.
 *
 * A page that will not load is skipped rather than thrown: one unreachable page
 * should cost the calendar the shows on that page, not the whole sync. A row
 * that will not parse yields an empty `curtains`, and the caller leaves that
 * show alone.
 */
export async function fetchPublishedRuns(year: number): Promise<PublishedRun[]> {
  const runs: PublishedRun[] = [];

  for (const url of SEASON_PAGES) {
    let html: string;
    try {
      const res = await fetch(url, {
        // The season changes a few times a year; an hour-old answer is fine and
        // hammering the marketing site on every sync is not.
        next: { revalidate: 3600 },
        headers: { accept: "text/html" },
      });
      if (!res.ok) continue;
      html = await res.text();
    } catch {
      continue;
    }

    for (const { name, row } of extractCurtainRows(html)) {
      runs.push({ name, row, curtains: parseCurtains(row, year) });
    }
  }

  return runs;
}

/**
 * The run whose first curtain falls exactly on `opensOn` (YYYY-MM-DD).
 *
 * Exactly one, or none. Two shows opening the same night is a real thing — two
 * casts of the same title often do — and in that case the date is not enough to
 * tell them apart, so this refuses rather than picks. Refusing leaves those
 * shows on whatever the calendar already said, which is a visible problem; a
 * wrong guess is an invisible one.
 */
export function runOpeningOn(runs: PublishedRun[], opensOn: string): PublishedRun | null {
  const matches = runs.filter(
    (run) => run.curtains.length > 0 && run.curtains[0].date === opensOn
  );
  return matches.length === 1 ? matches[0] : null;
}
