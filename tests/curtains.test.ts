import { describe, expect, it } from "vitest";
import { extractCurtainRows, parseCurtains } from "@/lib/api/curtains";

/**
 * The parser that decides what time a family turns up.
 *
 * Every row here is copied verbatim from novapa.org rather than invented, so
 * these tests fail if the site's wording changes — which is the point. A
 * silently mis-parsed row would put a confident wrong curtain in front of 769
 * families, and the whole reason this module exists is that the previous answer
 * was made up.
 */

describe("the rows actually on novapa.org today", () => {
  it("reads Frozen KIDS — one Friday night, two on the Saturday", () => {
    // CJ, 4 Sep 2026: "The shows for Frozen Kids are Friday at 7pm and
    // Saturday at 2pm and 7pm."
    expect(parseCurtains("Jan 22 7pm &middot; Jan 23 2pm &amp; 7pm", 2027)).toEqual([
      { date: "2027-01-22", time: "19:00" },
      { date: "2027-01-23", time: "14:00" },
      { date: "2027-01-23", time: "19:00" },
    ]);
  });

  it("reads Sweeney's six-date run, which ticketing already agrees with", () => {
    // These are the same seven curtains as public.tix_performances, which is
    // the best evidence available that the website row is maintained.
    const parsed = parseCurtains(
      "Oct 23 7pm &middot; Oct 24 2pm &amp; 7pm &middot; Oct 25 2pm &middot; Oct 30 7pm &middot; Oct 31 2pm &middot; Nov 1 2pm",
      2026
    );
    expect(parsed).toEqual([
      { date: "2026-10-23", time: "19:00" },
      { date: "2026-10-24", time: "14:00" },
      { date: "2026-10-24", time: "19:00" },
      { date: "2026-10-25", time: "14:00" },
      { date: "2026-10-30", time: "19:00" },
      { date: "2026-10-31", time: "14:00" },
      { date: "2026-11-01", time: "14:00" },
    ]);
  });

  it("reads a camp showcase — four curtains in one afternoon, comma separated", () => {
    expect(
      parseCurtains("Jul 16 5pm &amp; 7pm &middot; Jul 17 11am, 1pm, 4pm &amp; 7pm", 2027)
    ).toEqual([
      { date: "2027-07-16", time: "17:00" },
      { date: "2027-07-16", time: "19:00" },
      { date: "2027-07-17", time: "11:00" },
      { date: "2027-07-17", time: "13:00" },
      { date: "2027-07-17", time: "16:00" },
      { date: "2027-07-17", time: "19:00" },
    ]);
  });
});

describe("times", () => {
  it("puts noon and midnight on the right side of the clock", () => {
    expect(parseCurtains("Jan 1 12pm", 2027)).toEqual([{ date: "2027-01-01", time: "12:00" }]);
    expect(parseCurtains("Jan 1 12am", 2027)).toEqual([{ date: "2027-01-01", time: "00:00" }]);
  });

  it("takes a half hour", () => {
    expect(parseCurtains("Mar 6 2:30pm", 2027)).toEqual([{ date: "2027-03-06", time: "14:30" }]);
  });

  it("rolls into the new year when the months go backwards", () => {
    // A January date after a December one in the same run is next year, not
    // eleven months ago.
    expect(parseCurtains("Dec 30 7pm &middot; Jan 2 2pm", 2026)).toEqual([
      { date: "2026-12-30", time: "19:00" },
      { date: "2027-01-02", time: "14:00" },
    ]);
  });
});

describe("what it refuses to guess", () => {
  /*
   * Each of these would once have become "19:00, probably". Returning nothing
   * is the contract: the caller leaves the calendar alone rather than writing a
   * time nobody published.
   */
  it("gives up on a row with no time at all", () => {
    expect(parseCurtains("Jan 22 &middot; Jan 23", 2027)).toEqual([]);
    expect(parseCurtains("TBA", 2027)).toEqual([]);
    expect(parseCurtains("", 2027)).toEqual([]);
  });

  it("gives up on a time it cannot read", () => {
    expect(parseCurtains("Jan 22 evening", 2027)).toEqual([]);
    expect(parseCurtains("Jan 22 25pm", 2027)).toEqual([]);
    expect(parseCurtains("Jan 22 7", 2027)).toEqual([]);
  });

  it("gives up on a month it does not know", () => {
    expect(parseCurtains("Smarch 22 7pm", 2027)).toEqual([]);
  });

  it("gives up on the WHOLE row when one group is bad", () => {
    // Half a run is worse than none, because it looks complete.
    expect(parseCurtains("Jan 22 7pm &middot; Jan 23 sometime", 2027)).toEqual([]);
  });
});

describe("finding the rows in the page", () => {
  const page = `
    <article class="pgm-card reveal">
      <div class="pgm-body">
        <h3 class="pgm-name">Disney&rsquo;s Frozen KIDS</h3>
        <div class="pgm-rows">
          <div class="pgm-row"><span>Season</span><span>Sep 16, 2026 &ndash; Jan 20, 2027</span></div>
          <div class="pgm-row"><span>Curtains</span><span style="text-align:right">Jan 22 7pm &middot; Jan 23 2pm &amp; 7pm</span></div>
        </div>
      </div>
    </article>
    <article class="pgm-card reveal">
      <div class="pgm-body">
        <h3 class="pgm-name">Disney&rsquo;s Frozen JR.</h3>
        <div class="pgm-rows">
          <div class="pgm-row"><span>Curtains</span><span>Jan 29 7pm &middot; Jan 30 2pm &amp; 7pm</span></div>
        </div>
      </div>
    </article>`;

  it("pairs each show with its own row", () => {
    expect(extractCurtainRows(page)).toEqual([
      { name: "Disney’s Frozen KIDS", row: "Jan 22 7pm · Jan 23 2pm & 7pm" },
      { name: "Disney’s Frozen JR.", row: "Jan 29 7pm · Jan 30 2pm & 7pm" },
    ]);
  });

  it("skips a card that has no curtains row rather than borrowing the next one", () => {
    const noRow = `<article class="pgm-card"><h3 class="pgm-name">A class</h3></article>${page}`;
    const found = extractCurtainRows(noRow);
    expect(found).toHaveLength(2);
    expect(found.every((f) => f.name.includes("Frozen"))).toBe(true);
  });
});
