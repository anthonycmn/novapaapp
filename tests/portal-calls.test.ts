import { describe, expect, it } from "vitest";
import {
  callsForEvent,
  callsForUid,
  overlayFor,
  runSheetFor,
  uniqueCalls,
  type PortalCall,
} from "@/lib/ical/portal-calls";

/**
 * The bridge from the staff portal's curriculum to the family calendar. The
 * portal splits one calendar event into a row per ROOM and staff correct it by
 * hand; this is what carries those corrections to families.
 */
const call = (over: Partial<PortalCall>): PortalCall => ({
  call_date: "2026-09-12",
  starts_at: "09:00:00",
  ends_at: "10:30:00",
  call_type: "Blocking",
  room: "Room A",
  staff_leading: "Colton",
  act_scene: "Pages 40 - 48",
  material: "Review Vocals and then Stage",
  called: ["Beggar Woman", "Mrs. Lovett", "Sweeney Todd"],
  calendar_status: "confirmed",
  ...over,
});

/** 12 Sep 2026, Eastern, as an ISO instant. */
const et = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  // September is EDT, UTC-4.
  return `2026-09-12T${String(h + 4).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;
};

describe("which calls belong to an event", () => {
  const morning = call({ starts_at: "09:00:00" });
  const late = call({ starts_at: "10:30:00", act_scene: "Pages 61 - 68" });
  const afternoon = call({ starts_at: "12:30:00", act_scene: "Pages 68 - 80" });
  const all = [morning, late, afternoon];

  /**
   * A Saturday is often two events. Giving both of them the whole day's rooms
   * would tell half the company to come at nine for a call at one.
   */
  it("splits a day between its events by the clock", () => {
    const am = callsForEvent(all, et("09:00"), et("12:30"));
    expect(am.map((c) => c.act_scene)).toEqual(["Pages 40 - 48", "Pages 61 - 68"]);
  });

  it("gives a boundary time to the later event", () => {
    const pm = callsForEvent(all, et("13:00"), et("15:00"));
    expect(pm).toEqual([]);
    const straddling = callsForEvent(all, et("12:30"), et("15:00"));
    expect(straddling.map((c) => c.act_scene)).toEqual(["Pages 68 - 80"]);
  });

  it("leaves a canceled call out", () => {
    const withCancelled = [...all, call({ starts_at: "09:30:00", calendar_status: "cancelled" })];
    expect(callsForEvent(withCancelled, et("09:00"), et("12:30"))).toHaveLength(2);
  });

  it("ignores another day entirely", () => {
    const other = call({ call_date: "2026-09-19" });
    expect(callsForEvent([other], et("09:00"), et("12:30"))).toEqual([]);
  });

  /** A day whose calls state no clock is still that day's work. */
  it("falls back to the whole day when no call states a time", () => {
    const untimed = call({ starts_at: null, ends_at: null });
    expect(callsForEvent([untimed], et("09:00"), et("12:30"))).toHaveLength(1);
  });
});

/**
 * The 12 September regression, verbatim. The calendar has a 9:00–12:30 event
 * and a 1:00–3:00 event; the afternoon's rooms start at 12:30, in the
 * half-hour gap between them. The old rule dropped them from BOTH events —
 * which is how Sweeney Todd and Mrs. Lovett vanished from a Saturday they
 * were called to for two and a half hours, and their families were told they
 * were not needed.
 */
describe("a call that starts between two events", () => {
  const day = [
    call({ starts_at: "09:00:00", ends_at: "10:30:00", act_scene: "Pages 40 - 48" }),
    call({ starts_at: "10:30:00", ends_at: "12:00:00", act_scene: "Pages 61 - 68" }),
    call({
      starts_at: "12:30:00",
      ends_at: "15:00:00",
      act_scene: "Pages 68 - 80",
      called: ["Sweeney Todd", "Mrs. Lovett"],
    }),
    call({
      starts_at: "12:30:00",
      ends_at: "14:00:00",
      act_scene: "Pages 54 - 60",
      called: ["Beadle", "Anthony", "Johanna", "Judge Turpin"],
    }),
    call({
      starts_at: "14:00:00",
      ends_at: "15:00:00",
      act_scene: "Pages 50 - 53",
      called: ["Anthony", "Johanna"],
    }),
  ];
  const windows = [
    { startsAt: et("09:00"), endsAt: et("12:30") },
    { startsAt: et("13:00"), endsAt: et("15:00") },
  ];

  it("hands an orphaned call to the event its range overlaps", () => {
    const pm = callsForEvent(day, et("13:00"), et("15:00"), undefined, windows);
    expect(pm.map((c) => c.act_scene)).toEqual([
      "Pages 68 - 80",
      "Pages 54 - 60",
      "Pages 50 - 53",
    ]);
  });

  it("keeps the morning's own calls with the morning", () => {
    const am = callsForEvent(day, et("09:00"), et("12:30"), undefined, windows);
    expect(am.map((c) => c.act_scene)).toEqual(["Pages 40 - 48", "Pages 61 - 68"]);
  });

  it("tells the whole day's cast the truth", () => {
    // The families this bug hid: Todd, Lovett, Beadle and the Judge are all
    // in the afternoon overlay once the orphans land where they belong.
    const pm = callsForEvent(day, et("13:00"), et("15:00"), undefined, windows);
    const overlay = overlayFor(pm);
    for (const name of ["Sweeney Todd", "Mrs. Lovett", "Beadle", "Judge Turpin"]) {
      expect(overlay.calledNote).toContain(name);
    }
  });

  it("does not adopt orphans without the day's full window list", () => {
    // With only its own window to look at, adopting would over-claim.
    const pm = callsForEvent(day, et("13:00"), et("15:00"));
    expect(pm.map((c) => c.act_scene)).toEqual(["Pages 50 - 53"]);
  });
});

describe("what families are told", () => {
  it("joins the cast across the rooms of one event, without repeats", () => {
    const overlay = overlayFor([
      call({ called: ["Sweeney Todd", "Mrs. Lovett"] }),
      call({ called: ["Mrs. Lovett", "Toby"] }),
    ]);
    expect(overlay.calledNote).toBe("Sweeney Todd · Mrs. Lovett · Toby");
  });

  /** Page numbers are the thing Tony writes and wants families to see. */
  it("puts the pages and the work in the note", () => {
    const overlay = overlayFor([call({})]);
    expect(overlay.worksNote).toBe("Pages 40 - 48 — Review Vocals and then Stage");
  });

  it("copes with only one half of the pair", () => {
    expect(overlayFor([call({ act_scene: null })]).worksNote).toBe(
      "Review Vocals and then Stage"
    );
    expect(overlayFor([call({ material: null, call_type: null })]).worksNote).toBe(
      "Pages 40 - 48"
    );
  });

  /**
   * Nulls, not empty strings: the caller keeps whatever the calendar gave it
   * rather than blanking a note that was perfectly good.
   */
  it("says nothing when the portal has nothing", () => {
    expect(overlayFor([])).toEqual({ calledNote: null, worksNote: null });
    expect(
      overlayFor([call({ called: [], act_scene: null, material: null, call_type: null })])
    ).toEqual({ calledNote: null, worksNote: null });
  });

  it("does not put the room or the staff member on a family's calendar", () => {
    const overlay = overlayFor([call({})]);
    expect(overlay.worksNote).not.toContain("Room A");
    expect(overlay.worksNote).not.toContain("Colton");
  });
});

/**
 * The run sheet — CJ, 16 Sep 2026: "I need them to have the same calendar,
 * run pages, etc . . . . and I want the staff page to be the authority." A
 * family reads the same room blocks a director does, in the same order.
 */
describe("the run sheet is the staff portal's", () => {
  it("keeps every room, in the order the day is run", () => {
    const run = runSheetFor([
      call({ id: "b", starts_at: "10:30:00", ends_at: "12:00:00", material: "Blocking", sort_order: 2 }),
      call({ id: "a", starts_at: "09:00:00", ends_at: "10:30:00", sort_order: 1 }),
      call({ id: "c", starts_at: "09:00:00", ends_at: "10:30:00", material: "Movement", room: "Room B", sort_order: 3 }),
    ]);
    expect(run.map((block) => block.id)).toEqual(["a", "c", "b"]);
    expect(run[0]).toMatchObject({
      start: "09:00",
      end: "10:30",
      room: "Room A",
      leader: "Colton",
      title: "Blocking",
      pages: "Pages 40 - 48",
      what: "Review Vocals and then Stage",
      called: ["Beggar Woman", "Mrs. Lovett", "Sweeney Todd"],
    });
  });

  it("shows the same short names the staff page's chips show, once each", () => {
    const run = runSheetFor([call({ called: ["Mrs. Lovett", "Sweeney Todd", "Sweeney Todd"] })]);
    expect(run[0].called).toEqual(["Mrs. Lovett", "Sweeney Todd"]);
  });

  it("resolves the cast to roles once, at sync time", () => {
    const run = runSheetFor([call({})], (called) => called.map((name) => `role:${name}`));
    expect(run[0].roleIds).toEqual(["role:Beggar Woman", "role:Mrs. Lovett", "role:Sweeney Todd"]);
    // A block calling nobody is not resolved to nobody: null means everyone.
    expect(runSheetFor([call({ called: [] })], () => ["x"])[0].roleIds).toBeNull();
  });

  /** The staff sync writes a created call's type and material from one label. */
  it("does not say the same label twice", () => {
    const run = runSheetFor([call({ material: "Act II Sequence", call_type: "Act II Sequence" })]);
    expect(run[0].title).toBe("Act II Sequence");
    expect(run[0].what).toBeNull();
  });
});

describe("a bound call belongs to its event by identity", () => {
  it("finds the rows bound to the Google UID, skipping cancelled ones", () => {
    const rows = [
      call({ id: "1", calendar_uid: "abc@google.com" }),
      call({ id: "2", calendar_uid: "abc@google.com", calendar_status: "cancelled" }),
      call({ id: "3", calendar_uid: "other@google.com" }),
      call({ id: "4", calendar_uid: null }),
    ];
    expect(callsForUid(rows, "abc@google.com").map((c) => c.id)).toEqual(["1"]);
    expect(callsForUid(rows, "")).toEqual([]);
  });

  it("takes each row once when identity and the clock both claim it", () => {
    const row = call({ id: "1", calendar_uid: "abc@google.com" });
    expect(uniqueCalls([row, row, call({ id: "2" })]).map((c) => c.id)).toEqual(["1", "2"]);
  });
});

