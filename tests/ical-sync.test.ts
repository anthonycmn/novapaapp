import { describe, expect, it } from "vitest";
import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";
import { callTimeFor, cleanTitle, eventTypeFor } from "@/lib/ical/map";
import { parseIcal } from "@/lib/ical/parse";

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
