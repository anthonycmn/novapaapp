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
  /** The staff portal's row id; carried onto the run block so a family and a
   *  director can point at the same line. */
  id?: string;
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
  /** The staff portal's own cast-list wording ("Leads only"), when it has one. */
  called_label?: string | null;
  calendar_status: string | null;
  /**
   * The Google event this row is bound to (staff_portal.curriculum_calls.
   * calendar_uid) — the same UID the family calendar keeps in external_ref.
   * When both sides know it, the block belongs to that event by identity and
   * the clock-window heuristic below is only for the rows that never bound
   * (lunch, Labor Day). Null on an unbound row.
   */
  calendar_uid?: string | null;
  sort_order?: number | null;
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

/**
 * One room block of the staff portal's "Run the day", as a family reads it.
 *
 * What a director sees on the staff page, minus the staff-only notes: when,
 * where, who leads, what is worked (with the page range when the sheet gives
 * one) and who is called. `roleIds` is the cast resolved to this show's
 * family-hub roles at sync time, so a child's row can be marked without the
 * two portals' spellings ever having to agree in the browser.
 */
export interface RunBlock {
  id: string | null;
  /** "09:00", wall clock in the org's timezone; null when the row states none. */
  start: string | null;
  end: string | null;
  room: string | null;
  leader: string | null;
  /** The block's heading — the staff page's call_type ("Music call", "LUNCH"). */
  title: string | null;
  /** The staff page's second line: act_scene ("Pages 94 - 99") — material. */
  pages: string | null;
  what: string | null;
  /** Character keys, the same short names the staff page's chips show. */
  called: string[];
  calledLabel: string | null;
  roleIds: string[] | null;
}

/**
 * Which of a show's calls belong to this event BY IDENTITY.
 *
 * The staff portal binds every call it can to the Google event's UID, and the
 * family calendar keeps that same UID in external_ref — so the two can agree
 * on ownership exactly, without guessing from the clock. The clock rule in
 * callsForEvent is still needed for the rows that never bind (lunch is
 * described inside the surrounding event, not an event of its own), so the
 * caller takes the union: bound rows by UID, unbound rows by window.
 */
export function callsForUid(calls: PortalCall[], uid: string): PortalCall[] {
  if (!uid) return [];
  return calls.filter(
    (call) => call.calendar_uid === uid && call.calendar_status !== "cancelled"
  );
}

/** Deduplicate by row id (or by the row itself when it has none). */
export function uniqueCalls(calls: PortalCall[]): PortalCall[] {
  const seen = new Set<string>();
  const out: PortalCall[] = [];
  for (const call of calls) {
    const key = call.id ?? `${call.call_date}|${call.starts_at}|${call.material}|${call.room}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(call);
  }
  return out;
}

/**
 * The run sheet for one event, in the order the day is run: by start time,
 * then the staff portal's own ordering, so two rooms that open at nine keep
 * the order the director put them in.
 *
 * Each block is the staff page's row, field for field: its heading is the
 * call_type, its second line "act_scene — material", its chips the character
 * KEYS ("Mrs. Lovett", "Toby") — the short names the staff page shows and the
 * ones the family-hub role aliases were written against. `roleIdsFor`
 * resolves those keys to this show's family-hub role ids, or null when it
 * cannot — null is "show this to everyone", the same meaning it has on the
 * event.
 */
export function runSheetFor(
  calls: PortalCall[],
  roleIdsFor: (names: string[]) => string[] | null = () => null
): RunBlock[] {
  const ordered = [...calls].sort((a, b) => {
    const at = a.starts_at ?? "";
    const bt = b.starts_at ?? "";
    if (at !== bt) return at.localeCompare(bt);
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });
  return ordered.map((call) => {
    const called: string[] = [];
    for (const key of call.called ?? []) {
      const name = String(key).trim();
      if (name && !called.includes(name)) called.push(name);
    }
    const title = (call.call_type ?? call.material ?? "").trim() || null;
    const material = (call.material ?? "").trim() || null;
    return {
      id: call.id ?? null,
      start: hhmm(call.starts_at),
      end: hhmm(call.ends_at),
      room: (call.room ?? "").trim() || null,
      leader: (call.staff_leading ?? "").trim() || null,
      title,
      pages: (call.act_scene ?? "").trim() || null,
      // A created call's material IS its type (the staff sync writes both
      // from the same label); saying it twice tells nobody anything.
      what: material && material !== title ? material : null,
      called,
      calledLabel: (call.called_label ?? "").trim() || null,
      roleIds: called.length > 0 ? roleIdsFor(called) : null,
    };
  });
}

