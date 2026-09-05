import { formatInTimeZone } from "date-fns-tz";
import { org } from "@/config/org";

/**
 * The bridge from the staff portal's curriculum to the family calendar.
 *
 * Tony, 2 Sep 2026: "BUILD THE BRIDGE TO THE PARENT SIDE SO THAT WHEN IT
 * CHANGES ON THE STAFF SIDE IT CHANGES ON THE PARENT SIDE AS WELL."
 *
 * Both sides already read the same Google calendar, separately: the hub turns
 * an event into one row on a family's schedule, and the portal turns the same
 * event into one row per ROOM, which is how a rehearsal is actually run. The
 * portal's version is therefore the better one — it knows that Saturday at ten
 * is three rooms, and it is the copy staff correct by hand when a cast changes
 * or a room moves. None of that reached families.
 *
 * WHY THIS IS NOT A SECOND WRITER. The obvious shape — a job that writes
 * calendar_events from the portal — would fight the iCal sync every hour, each
 * overwriting the other, and families would watch their calendar flicker
 * between two versions. So this is not a job. It is a step INSIDE the iCal
 * sync, run after the feed has been read and before anything is written, and
 * the rule is simply that the portal wins where it has something to say. One
 * writer, one pass, and a clear precedence.
 *
 * WHAT THE PORTAL WINS ON: who is called, and what is worked. Not the time and
 * not the venue — those are the calendar's, and the portal takes them from the
 * calendar too, so letting it restate them would only add a way for the two to
 * disagree.
 */

export interface PortalCall {
  call_date: string;
  /** "09:00:00" — a wall clock in the org's timezone, no date attached. */
  starts_at: string | null;
  ends_at: string | null;
  call_type: string | null;
  room: string | null;
  staff_leading: string | null;
  /** The workbook's scene reference, or "Pages 40 - 48" on a created call. */
  act_scene: string | null;
  material: string | null;
  /** Character keys — the same words the family calendar filters on. */
  called: string[] | null;
  calendar_status: string | null;
}

/** What the portal has to say about one event. */
export interface PortalOverlay {
  calledNote: string | null;
  worksNote: string | null;
}

const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A same-day sibling's clock window, for deciding which event owns a call. */
export interface EventWindow {
  startsAt: string;
  endsAt: string;
}

/**
 * Which of a day's calls belong to this event.
 *
 * By the clock, not by the day: a Saturday is often two events — a morning and
 * an afternoon — and giving both of them the whole day's rooms would tell half
 * the company to come at nine for something they are called to at one. A call
 * belongs to the window that contains its start; the boundary goes to the
 * later event, so 12:30 is the start of the afternoon rather than the tail of
 * the morning.
 *
 * A call that starts in NO window still belongs somewhere. 12 September's
 * calendar has a 9:00–12:30 event and a 1:00–3:00 event, and the afternoon's
 * rooms start at 12:30 — in the half-hour gap. The old rule dropped them from
 * both events, which is how Sweeney Todd and Mrs. Lovett vanished from a
 * Saturday they were called to for two and a half hours. An orphaned call now
 * goes to the sibling its RANGE overlaps most (12:30–15:00 overlaps the
 * afternoon by two hours and the morning by nothing), and only to the nearest
 * edge when it overlaps nothing at all, later event winning a tie.
 */
export function callsForEvent(
  calls: PortalCall[],
  startsAt: string,
  endsAt: string,
  timeZone: string = org.timeZone,
  siblings: EventWindow[] = []
): PortalCall[] {
  const date = formatInTimeZone(new Date(startsAt), timeZone, "yyyy-MM-dd");
  const from = formatInTimeZone(new Date(startsAt), timeZone, "HH:mm");
  const to = formatInTimeZone(new Date(endsAt), timeZone, "HH:mm");

  const sameDay = calls.filter(
    (call) => call.call_date === date && call.calendar_status !== "cancelled"
  );
  // An event with no width — or one whose calls state no clock — takes the day.
  const timed = sameDay.filter((call) => hhmm(call.starts_at));
  if (timed.length === 0 || from >= to) return sameDay;

  /*
   * Orphan adoption needs the WHOLE day's windows to be safe: with only its
   * own window to look at, an event would adopt every stray call on the day,
   * and the morning would claim the afternoon's rooms. A caller that cannot
   * supply the siblings gets the strict containment rule instead.
   */
  if (siblings.length === 0) {
    return timed.filter((call) => {
      const start = hhmm(call.starts_at)!;
      return start >= from && start < to;
    });
  }

  // Every sibling window on this same local day, this event among them.
  const windows = siblings
    .map((sib) => ({
      date: formatInTimeZone(new Date(sib.startsAt), timeZone, "yyyy-MM-dd"),
      from: formatInTimeZone(new Date(sib.startsAt), timeZone, "HH:mm"),
      to: formatInTimeZone(new Date(sib.endsAt), timeZone, "HH:mm"),
    }))
    .filter((w) => w.date === date && w.from < w.to);
  if (!windows.some((w) => w.from === from && w.to === to)) {
    windows.push({ date, from, to });
  }

  const owner = (call: PortalCall): { from: string; to: string } | null => {
    const start = hhmm(call.starts_at)!;
    const contains = windows.filter((w) => start >= w.from && start < w.to);
    if (contains.length > 0) {
      // Boundary to the later event: the last window whose start is <= call.
      return contains.sort((a, b) => a.from.localeCompare(b.from)).at(-1)!;
    }
    // Orphan: no window contains it. Most overlapped range wins; a call with
    // no end, or no overlap anywhere, goes to the nearest edge. Ties later.
    const end = hhmm(call.ends_at) ?? start;
    let best: { w: { from: string; to: string }; overlap: number; gap: number } | null = null;
    for (const w of windows) {
      const overlap = Math.max(
        0,
        Math.min(mins(end), mins(w.to)) - Math.max(mins(start), mins(w.from))
      );
      const gap = Math.min(
        Math.abs(mins(start) - mins(w.from)),
        Math.abs(mins(start) - mins(w.to))
      );
      const wins =
        !best ||
        overlap > best.overlap ||
        (overlap === best.overlap && gap < best.gap) ||
        (overlap === best.overlap && gap === best.gap && w.from >= best.w.from);
      if (wins) best = { w, overlap, gap };
    }
    return best?.w ?? null;
  };

  return timed.filter((call) => {
    const w = owner(call);
    return w !== null && w.from === from && w.to === to;
  });
}

/**
 * What families should be told about this event, in the portal's words.
 *
 * Returns nulls when the portal has nothing — the caller keeps whatever it
 * read from the calendar rather than blanking a note that was fine.
 */
export function overlayFor(calls: PortalCall[]): PortalOverlay {
  const called: string[] = [];
  const works: string[] = [];

  for (const call of calls) {
    for (const key of call.called ?? []) {
      const name = String(key).trim();
      if (name && !called.includes(name)) called.push(name);
    }
    // "Pages 40 - 48 — Review Vocals", or whichever half exists. The room and
    // the staff member stay out of it: a family is being told what their child
    // is working, not the staffing plan.
    const part = [call.act_scene, call.material ?? call.call_type]
      .map((piece) => (piece ?? "").trim())
      .filter(Boolean)
      .join(" — ");
    if (part && !works.includes(part)) works.push(part);
  }

  return {
    calledNote: called.length > 0 ? called.join(" · ") : null,
    worksNote: works.length > 0 ? works.join(" · ") : null,
  };
}
