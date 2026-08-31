import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import {
  blockSheetFrom,
  calledFrom,
  calledNoteFor,
  callTimeFor,
  cleanTitle,
  descriptionLines,
  eventTypeFor,
  worksNoteFor,
} from "@/lib/ical/map";
import { parseIcal } from "@/lib/ical/parse";
import { locationFor } from "@/lib/ical/map";
import { roleIdsFromCalledNote } from "@/lib/ical/map";

const et = (iso: string) => formatInTimeZone(new Date(iso), org.timeZone, "yyyy-MM-dd h:mm a");

describe("call times stated in the event title", () => {
  /**
   * The regression that matters: these calendar blocks START at the call, not
   * at curtain. Deriving the call by subtracting (curtain − call) from the
   * start put "be there by" 90 minutes early — an empty theatre at 11am.
   */
  it("reads the stated call time when the block starts at the call", () => {
    const call = callTimeFor(
      "MATINEE (call 12:30, curtain 2:00)",
      "2026-10-24T16:30:00.000Z" // 12:30 PM ET
    );
    expect(call).not.toBeNull();
    expect(et(call!)).toBe("2026-10-24 12:30 PM");
  });

  it("reads the stated call time when the block starts at curtain", () => {
    const call = callTimeFor(
      "OPENING NIGHT (call 5:30, curtain 7:00)",
      "2026-10-23T23:00:00.000Z" // 7:00 PM ET
    );
    expect(et(call!)).toBe("2026-10-23 5:30 PM");
  });

  it("treats a bare hour under 8 as the afternoon", () => {
    // 2:00 must be 2 PM, never 2 AM — the matinee bug in one line.
    const call = callTimeFor("MATINEE (call 2:00, curtain 3:30)", "2026-10-25T18:00:00.000Z");
    expect(et(call!)).toBe("2026-10-25 2:00 PM");
  });

  it("returns null when the title states no call", () => {
    expect(callTimeFor("Rehearsal - Rm A / Rm B", "2026-09-24T23:00:00.000Z")).toBeNull();
  });

  it("refuses a call that would fall after the event starts", () => {
    // Stated call 5:30 PM against a 1:00 PM block: the title and the calendar
    // disagree, so publish nothing rather than a call time that is a guess.
    expect(callTimeFor("MATINEE (call 5:30, curtain 7:00)", "2026-10-24T17:00:00.000Z")).toBeNull();
  });

  it("reads a morning call as stated rather than bumping it to the afternoon", () => {
    // 9 is at or past the 8 threshold, so it stays 9 AM — a tech Saturday.
    const call = callTimeFor("Tech day (call 9:00)", "2026-10-17T14:00:00.000Z");
    expect(et(call!)).toBe("2026-10-17 9:00 AM");
  });
});

describe("event typing", () => {
  it("types performances, tech and calls apart", () => {
    expect(eventTypeFor("MATINEE (call 12:30, curtain 2:00)")).toBe("performance");
    expect(eventTypeFor("OPENING NIGHT (call 5:30, curtain 7:00)")).toBe("performance");
    expect(eventTypeFor("Rehearsal - Rm A / Rm B")).toBe("rehearsal");
    expect(eventTypeFor("Cue to cue")).toBe("tech");
    expect(eventTypeFor("NO REHEARSAL - Fall break")).toBe("other");
  });

  it("does not read a no-rehearsal marker as a call", () => {
    // "NO REHEARSAL" contains neither a call nor a curtain; typing it as a
    // rehearsal would put a phantom call on every family's calendar.
    expect(eventTypeFor("NO REHEARSAL (Thanksgiving)")).toBe("other");
  });
});

describe("titles", () => {
  it("strips the show prefix families already know", () => {
    expect(cleanTitle("Sweeney Todd - Rehearsal - Rm A / Rm B", /^Sweeney Todd\s*[-–—]\s*/i)).toBe(
      "Rehearsal - Rm A / Rm B"
    );
  });

  it("keeps the original when stripping would leave nothing", () => {
    expect(cleanTitle("Sweeney Todd - ", /^Sweeney Todd\s*[-–—]\s*/i)).toBe("Sweeney Todd - ");
  });
});

describe("ical parsing", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:abc123",
    "SUMMARY:Sweeney Todd - MATINEE (call 12:30\\, curtain 2:00)",
    "LOCATION:Loudoun Auditorium\\, National Conference Center",
    "DTSTART:20261024T163000Z",
    "DTEND:20261024T203000Z",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:allday1",
    "SUMMARY:Fall break",
    "DTSTART;VALUE=DATE:20261012",
    "DTEND;VALUE=DATE:20261013",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("unescapes commas and reads location", () => {
    const [first] = parseIcal(ics);
    expect(first.summary).toBe("Sweeney Todd - MATINEE (call 12:30, curtain 2:00)");
    expect(first.location).toBe("Loudoun Auditorium, National Conference Center");
  });

  it("puts an all-day event on the right local calendar day", () => {
    const allDay = parseIcal(ics)[1];
    expect(allDay.allDay).toBe(true);
    expect(formatInTimeZone(new Date(allDay.start), org.timeZone, "yyyy-MM-dd")).toBe("2026-10-12");
  });

  it("folds continuation lines back together", () => {
    const folded = [
      "BEGIN:VEVENT",
      "UID:fold1",
      "SUMMARY:A very long rehearsal title that Google",
      "  wrapped across lines",
      "DTSTART:20260924T230000Z",
      "DTEND:20260925T010000Z",
      "END:VEVENT",
    ].join("\r\n");
    expect(parseIcal(folded)[0].summary).toBe(
      "A very long rehearsal title that Google wrapped across lines"
    );
  });
});

describe("who is called to each rehearsal", () => {
  // The real shape of a Sweeney event description, HTML and all.
  const twoRoom =
    "<b>WEEK 1 · Monday 24 August 2026</b><br><br><b>JOINT</b> — Colton + Ryyana<br>" +
    "Read-through and music intro<br>Scene: Act I - Prologue through Sc. 3 (read)<br>" +
    "Music: The Ballad of Sweeney Todd<br>" +
    "<b>CALLED (12): Sweeney Todd · Mrs. Lovett · Anthony</b><br>" +
    "<b>PARENT ROOM</b> — Tony Cimino-Johnson<br>PARENT MEET AND GREET<br>" +
    "<b>CALLED: no student call</b><br>" +
    "<hr><b>CALLED — 12 of 12:</b><br>" +
    "<b>Sweeney Todd · Mrs. Lovett · Anthony · Johanna · Toby · Judge Turpin · " +
    "Beadle · Beggar Woman · Pirelli · Fogg · Ensemble · Young Lucy</b><br><br>" +
    "<b>NOT CALLED — 0 of 12:</b> nobody, this is a full-company call";

  const leadsOnly =
    "<b>ROOM B</b> — Ryyana Cunningham, Choreographer<br>Movement and staging - LEADS ONLY<br>" +
    "Scene: Act I Sc. 3, 6, 7<br>Music: Johanna's window<br>" +
    "<hr><b>CALLED — 5 of 12:</b><br><b>Sweeney Todd · Mrs. Lovett · Johanna · Judge Turpin · Beadle</b><br>" +
    "<b>NOT CALLED — 7 of 12:</b> Anthony · Toby";

  it("prefers the whole-event summary over the per-room lists", () => {
    // A two-room call has two CALLED lines; the family cares about the event.
    const called = calledFrom(twoRoom);
    expect(called.calledCount).toBe(12);
    expect(called.companyCount).toBe(12);
    expect(called.called).toHaveLength(12);
    expect(called.called[0]).toBe("Sweeney Todd");
    expect(called.called.at(-1)).toBe("Young Lucy");
  });

  it("reads a partial call", () => {
    const called = calledFrom(leadsOnly);
    expect(called.calledCount).toBe(5);
    expect(called.companyCount).toBe(12);
    expect(called.called).toEqual([
      "Sweeney Todd",
      "Mrs. Lovett",
      "Johanna",
      "Judge Turpin",
      "Beadle",
    ]);
  });

  it("splits on the middle dot, not on commas", () => {
    // "Mrs. Lovett" and "Colton Sorenson, Director" both contain punctuation
    // that a comma split would tear in half.
    expect(calledFrom(leadsOnly).called).toContain("Mrs. Lovett");
  });

  it("falls back to per-room lists when there is no summary footer", () => {
    const noFooter =
      "<b>ROOM A</b><br>Music call<br><b>CALLED (2): Toby · Pirelli</b><br>" +
      "<b>ROOM B</b><br><b>CALLED (2): Toby · Fogg</b>";
    expect(calledFrom(noFooter).called).toEqual(["Toby", "Pirelli", "Fogg"]);
  });

  it("says so when nobody is called", () => {
    const parentsOnly =
      "<b>PARENT ROOM</b><br>PARENT MEET AND GREET<br><b>CALLED: no student call</b>";
    expect(calledNoteFor(parentsOnly)).toBe("No student call");
  });

  it("returns nothing rather than guessing when the description is silent", () => {
    expect(calledNoteFor("<b>Some note with no call list</b>")).toBeUndefined();
    expect(calledNoteFor("")).toBeUndefined();
  });

  it("collects what the call works from Scene and Music", () => {
    expect(worksNoteFor(leadsOnly)).toBe("Act I Sc. 3, 6, 7 · Johanna's window");
  });

  it("does not repeat an identical Scene line from two rooms", () => {
    const repeated = "Scene: Act I Sc. 4<br><b>ROOM B</b><br>Scene: Act I Sc. 4";
    expect(worksNoteFor(repeated)).toBe("Act I Sc. 4");
  });

  it("decodes entities and strips tags when flattening a description", () => {
    expect(descriptionLines("<b>A &amp; B</b><br>C&nbsp;D")).toEqual(["A & B", "C D"]);
  });
});

describe("the call sheet drives who sees the rehearsal", () => {
  /**
   * called_note and role_ids are written in the same pass on purpose. The note
   * is re-read from the feed every hour, so deriving the ids separately would
   * let a cast change move the prose and leave the filter on yesterday's cast.
   */
  const ROLES = [
    { id: "r-todd", name: "Sweeney Todd" },
    { id: "r-lovett", name: "Mrs. Lovett" },
    { id: "r-anthony", name: "Anthony Hope" },
    { id: "r-toby", name: "Tobias Ragg" },
    { id: "r-pirelli", name: "Adolfo Pirelli" },
    { id: "r-fogg", name: "Jonas Fogg" },
    { id: "r-ensemble", name: "Ensemble of London" },
  ];
  const ALIASES = { Toby: "Tobias Ragg" };
  const resolve = (note: string) => roleIdsFromCalledNote(note, ROLES, ALIASES);

  it("matches a role named in full", () => {
    expect(resolve("Sweeney Todd · Mrs. Lovett")).toEqual(["r-todd", "r-lovett"]);
  });

  it("matches the shorthand the show calendar actually uses", () => {
    // Prefix, suffix and alias — the three shapes on the Sweeney call sheet.
    expect(resolve("Anthony")).toEqual(["r-anthony"]);
    expect(resolve("Pirelli")).toEqual(["r-pirelli"]);
    expect(resolve("Fogg")).toEqual(["r-fogg"]);
    expect(resolve("Ensemble")).toEqual(["r-ensemble"]);
    expect(resolve("Toby")).toEqual(["r-toby"]);
  });

  it("does not let a partial word match the wrong role", () => {
    // "Ant" is not Anthony Hope; a substring match would have said it was.
    expect(resolve("Ant")).toBeNull();
  });

  /**
   * The one that protects a child's attendance. If ANY name fails to resolve
   * we stop filtering entirely, because a half-read cast list hides exactly
   * the people we could not identify.
   */
  it("opens the event to everyone when any name cannot be resolved", () => {
    expect(resolve("Sweeney Todd · Crew · Mrs. Lovett")).toBeNull();
  });

  it("opens the event to everyone when there is no call sheet", () => {
    expect(resolve("")).toBeNull();
    expect(resolve("   ")).toBeNull();
    expect(resolve("No student call")).toBeNull();
  });

  it("counts a role named twice only once", () => {
    expect(resolve("Ensemble · Ensemble")).toEqual(["r-ensemble"]);
  });
});

describe("the address families drive to", () => {
  /**
   * The feed owns WHEN a call is and has been wrong about WHERE. Correcting
   * the stored row did not survive — the sync rewrites location every hour and
   * reverted a fixed address twice — so the correction lives on the feed.
   */
  const feed = {
    key: "test_ics",
    productionId: "prod-1",
    locationRewrites: [
      { when: /^Rehearsal Space/i, use: "18945 Conference Center Drive, Leesburg VA 20175 — park in the south lot" },
    ],
  };

  it("corrects the rehearsal address the feed supplies", () => {
    expect(
      locationFor("Rehearsal Space, South Building Plaza C, 18945 Conference Center Drive, Leesburg VA 20176", feed)
    ).toBe("18945 Conference Center Drive, Leesburg VA 20175 — park in the south lot");
  });

  /** The show moves to the auditorium on 4 Oct and the feed has that right. */
  it("leaves a venue the rule does not name alone", () => {
    const auditorium = "Loudoun Auditorium, National Conference Center, 18945 Conference Center Drive, Plaza C, Leesburg VA 20175";
    expect(locationFor(auditorium, feed)).toBe(auditorium);
  });

  it("passes the feed through untouched when there are no rules", () => {
    const bare = { key: "k", productionId: "p" };
    expect(locationFor("Somewhere Else", bare)).toBe("Somewhere Else");
    expect(locationFor("", bare)).toBe("");
  });
});

/**
 * The regression that cost a month of the Sweeney curriculum: Google Calendar's
 * rich-text editor writes one <div> per line and emits no <br> at all. Stripping
 * those without putting the break back collapsed the whole description onto one
 * line, so nothing anchored to ^CALLED or ^Scene: — while the title, times and
 * location parsed perfectly, which is what made it look like missing content
 * rather than a parser fault.
 */
describe("descriptions whose line breaks are block tags, not <br>", () => {
  const divs =
    "<div>Rm A</div>" +
    "<div><b>CALLED (5): Sweeney Todd · Mrs. Lovett · Toby</b></div>" +
    "<div>Scene: Act I Sc. 1, 2</div>" +
    "<div>Music: No Place Like London</div>";

  const list =
    "<p>Rm A</p><ul>" +
    "<li>CALLED (5): Sweeney Todd · Mrs. Lovett · Toby</li>" +
    "<li>Scene: Act I Sc. 1, 2</li>" +
    "<li>Music: No Place Like London</li></ul>";

  it("breaks a <div>-per-line description into lines", () => {
    expect(descriptionLines(divs)).toEqual([
      "Rm A",
      "CALLED (5): Sweeney Todd · Mrs. Lovett · Toby",
      "Scene: Act I Sc. 1, 2",
      "Music: No Place Like London",
    ]);
  });

  it("breaks a bulleted description into lines", () => {
    expect(descriptionLines(list)).toEqual([
      "Rm A",
      "CALLED (5): Sweeney Todd · Mrs. Lovett · Toby",
      "Scene: Act I Sc. 1, 2",
      "Music: No Place Like London",
    ]);
  });

  it("reads the call sheet and the work out of both", () => {
    for (const description of [divs, list]) {
      expect(calledNoteFor(description)).toBe("Sweeney Todd · Mrs. Lovett · Toby");
      expect(worksNoteFor(description)).toBe("Act I Sc. 1, 2 · No Place Like London");
    }
  });

  /** Inline markup must not break a line it merely emphasizes. */
  it("keeps a line whole across bold and links", () => {
    expect(
      descriptionLines("<div><b>CALLED</b> <i>(5)</i>: <a href='#'>Toby</a> · Fogg</div>")
    ).toEqual(["CALLED (5): Toby · Fogg"]);
  });

  /** Song titles are matched on their text, so an escaped apostrophe is fatal. */
  it("decodes numeric entities inside a song title", () => {
    expect(descriptionLines("<div>Music: Pirelli&#39;s Miracle Elixir</div>")).toEqual([
      "Music: Pirelli's Miracle Elixir",
    ]);
  });

  it("still reads a <br> description exactly as before", () => {
    expect(
      descriptionLines("<b>CALLED (2): Toby · Fogg</b><br>Scene: Act I Sc. 1")
    ).toEqual(["CALLED (2): Toby · Fogg", "Scene: Act I Sc. 1"]);
  });
});

/**
 * The second format this calendar is written in. Verbatim lines, read off the
 * Sweeney calendar on 31 Aug 2026 — the template covers the first fortnight,
 * and from 10 Sep onward Tony writes his own shorthand. That shorthand carries
 * MORE than the template does (a time, a page run, the staff member, the room),
 * so the parser gives way rather than the director.
 */
describe("the free-form call sheet", () => {
  const ROLES = [
    { id: "r1", name: "Sweeney Todd" },
    { id: "r2", name: "Mrs. Lovett" },
    { id: "r3", name: "Anthony Hope" },
    { id: "r4", name: "Johanna" },
    { id: "r5", name: "Tobias Ragg" },
    { id: "r6", name: "Judge Turpin" },
    { id: "r7", name: "Beadle Bamford" },
    { id: "r8", name: "Adolfo Pirelli" },
    { id: "r9", name: "Beggar Woman" },
    { id: "r10", name: "Jonas Fogg" },
    { id: "r11", name: "Bird Seller" },
    { id: "r12", name: "Ensemble of London" },
    { id: "r13", name: "Young Lucy" },
  ];
  const ALIASES = { Toby: "Tobias Ragg", "Passer-by": "Ensemble of London" };
  const STAFF = ["Colton", "Ryyana", "Ava"];
  const SONGS = ["22. God, That's Good!", "2. No Place Like London"];
  const read = (line: string) => blockSheetFrom(line, ROLES, ALIASES, STAFF, SONGS);

  it("reads a ROOM-labelled line and drops the staff on both ends", () => {
    const sheet = read(
      "ROOM A — 7pm - 8pm with Colton: Pages 23 - 25 - Anthony, Judge, Johanna, Beadle - Colton"
    );
    expect(sheet.called).toEqual([
      "Anthony Hope",
      "Judge Turpin",
      "Johanna",
      "Beadle Bamford",
    ]);
    expect(sheet.pages).toEqual(["23-25"]);
    expect(sheet.unknown).toEqual([]);
  });

  it("separates a number, the cast and the room on one line", () => {
    const sheet = read(
      "9am - 10:30am - Pages 81 - 93: God That's Good - Lovett, Tobias, Todd, Ensemble with Ryyana - The Underground"
    );
    expect(sheet.called).toEqual([
      "Mrs. Lovett",
      "Tobias Ragg",
      "Sweeney Todd",
      "Ensemble of London",
    ]);
    expect(sheet.pages).toEqual(["81-93"]);
    expect(sheet.prose).toEqual(["God That's Good"]);
    expect(sheet.unknown).toEqual([]);
  });

  /** Tony, 31 Aug 2026: Passer-by is played by the Ensemble. */
  it("resolves Passer-by to the Ensemble rather than dropping it", () => {
    const sheet = read(
      "9am - 10:30am - Pages 94 - 100: Anthony, Todd, Beggar Woman, Johanna, Passer-by with Colton - Studio B"
    );
    expect(sheet.called).toEqual([
      "Anthony Hope",
      "Sweeney Todd",
      "Beggar Woman",
      "Johanna",
      "Ensemble of London",
    ]);
    expect(sheet.unknown).toEqual([]);
  });

  it("reads a singular Page range", () => {
    const sheet = read("10:30am - 12:30pm - Page 101 - 116: Mrs. Lovett, Todd, Tobias with Colton");
    expect(sheet.called).toEqual(["Mrs. Lovett", "Sweeney Todd", "Tobias Ragg"]);
    expect(sheet.pages).toEqual(["101-116"]);
  });

  it("keeps a described call with no pages", () => {
    const sheet = read("10:30am - 11:30pm - Fogg's Assylum Character Work - Ensemble with Ryyana");
    expect(sheet.called).toEqual(["Ensemble of London"]);
    expect(sheet.pages).toEqual([]);
    expect(sheet.prose).toEqual(["Fogg's Assylum Character Work"]);
  });

  /**
   * The under-call this guards. "Johanna Vocals" resolves to nothing as a
   * phrase, and dropping it would leave Johanna off her own call.
   */
  it("finds a name with the work attached to it", () => {
    const sheet = read("10:30am - 11:30am - Anthony & Johanna Vocals with Ava");
    expect(sheet.called).toEqual(["Anthony Hope", "Johanna"]);
    expect(sheet.prose).toEqual(["Vocals"]);
  });

  it("never mistakes a page span for a separator between names", () => {
    expect(read("Pages 23 - 25 - Anthony, Judge").pages).toEqual(["23-25"]);
    expect(read("Pages 23 - 25 - Anthony, Judge").called).toEqual([
      "Anthony Hope",
      "Judge Turpin",
    ]);
  });

  it("reports a name it cannot place instead of swallowing it", () => {
    const sheet = read("7pm - 9pm - Pages 5 - 9 - Anthony, Mxyzptlk");
    expect(sheet.called).toEqual(["Anthony Hope"]);
    expect(sheet.unknown).toEqual(["Mxyzptlk"]);
  });

  /** The whole point: this note then feeds the existing role_ids matcher. */
  it("produces a note the strict matcher can read back", () => {
    const sheet = read("ROOM B - 7pm - 9pm with Ryyana: Pages 25 - 40 - Todd, Lovett, Ensemble, Tobias, Pirelli, Beadle");
    const note = sheet.called.join(" · ");
    expect(note).toBe(
      "Sweeney Todd · Mrs. Lovett · Ensemble of London · Tobias Ragg · Adolfo Pirelli · Beadle Bamford"
    );
    expect(roleIdsFromCalledNote(note, ROLES, ALIASES)).toHaveLength(6);
  });
});
