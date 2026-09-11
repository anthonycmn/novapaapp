import "server-only";
import {
  getPortalReadClient,
  getPortalRpcClient,
  isSupabaseConfigured,
} from "../supabase/client";
import {
  generateSlotGrid,
  type AvailabilityWindow,
  type BusyInterval,
  type SlotOffer,
} from "./slots";
import type { Coach } from "./assemble";

/**
 * Booking a coaching session, from the family hub's side of the bridge.
 *
 * The rules live in the portal, in `family_book_coaching` (portal 0153):
 * availability is binding, the student must be the family's, the time must be
 * free, and there must be a session left in a package to draw from. This
 * module does not restate any of that — a second copy of a rule is a second
 * chance to disagree with it. It offers the times, calls the function, and
 * turns a Postgres error into a sentence a parent can act on.
 *
 * The offered times are computed HERE rather than in the database, because
 * generating a month of slots is arithmetic over two small lists and it is far
 * easier to test as `generateSlots` than as SQL. The database still has the
 * final word: every slot this module offers is re-checked on submit, so a slot
 * taken between the page rendering and the parent pressing it is refused.
 */

/** One package a family has bought, and what is left in it. */
export interface CoachingPackage {
  packageId: string;
  label?: string;
  studentId?: string;
  purchased: number;
  remaining: number;
}

/** A session the family has coming up. */
export interface UpcomingSession {
  sessionId: string;
  startsAt: string;
  durationMin: number;
  studentId?: string;
  studentName: string;
  coachStaffId?: string;
  coachName?: string;
}

export interface CoachingSummary {
  packages: CoachingPackage[];
  upcoming: UpcomingSession[];
  /** Sessions left across every package. What the booking button turns on. */
  sessionsLeft: number;
}

const EMPTY: CoachingSummary = { packages: [], upcoming: [], sessionsLeft: 0 };

/**
 * What this family has bought and has booked.
 *
 * Degrades to "nothing" if the portal is unreachable, matching every other
 * read across this bridge: the staff portal being down must not take a
 * family's portal down with it.
 */
export async function getCoachingSummary(
  familyId: string
): Promise<CoachingSummary> {
  if (!isSupabaseConfigured() || !familyId) return EMPTY;
  try {
    const { data, error } = await getPortalRpcClient().rpc(
      "family_coaching_summary",
      { p_family_id: familyId }
    );
    if (error) throw error;
    const payload = (data ?? {}) as {
      packages?: CoachingPackage[];
      upcoming?: UpcomingSession[];
    };
    const packages = payload.packages ?? [];
    return {
      packages,
      upcoming: payload.upcoming ?? [],
      sessionsLeft: packages.reduce(
        (total, pkg) => total + Math.max(0, Number(pkg.remaining) || 0),
        0
      ),
    };
  } catch {
    return EMPTY;
  }
}

/**
 * The hourly grid a family sees for one coach — taken hours included, marked.
 * Hourly rather than every 50 minutes, so each lesson leaves transition time
 * before the next student.
 */
export async function getSlotGrid(coach: Coach, now = new Date()): Promise<SlotOffer[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const portal = getPortalReadClient();
    const [availability, busy] = await Promise.all([
      portal
        .from("v_coaching_availability_public")
        .select("weekday, starts_at, ends_at")
        .eq("staff_id", coach.staffId),
      portal
        .from("v_coaching_busy_public")
        .select("starts_at, duration_min")
        .eq("staff_id", coach.staffId),
    ]);
    if (availability.error) throw availability.error;
    if (busy.error) throw busy.error;

    const windows: AvailabilityWindow[] = (availability.data ?? []).map((row) => ({
      weekday: Number((row as { weekday: unknown }).weekday),
      startsAt: String((row as { starts_at: unknown }).starts_at ?? ""),
      endsAt: String((row as { ends_at: unknown }).ends_at ?? ""),
    }));
    const taken: BusyInterval[] = (busy.data ?? []).map((row) => ({
      startsAt: String((row as { starts_at: unknown }).starts_at ?? ""),
      durationMin: Number((row as { duration_min: unknown }).duration_min) || 60,
    }));

    return generateSlotGrid(
      windows,
      taken,
      {
        sessionMinutes: coach.sessionMinutes,
        noticeHours: coach.noticeHours,
        horizonDays: coach.horizonDays,
      },
      now
    );
  } catch {
    return [];
  }
}

const WEEKDAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** "17:00:00" → "5:00 PM". */
function wallClock(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? "");
  if (!match) return hhmm;
  const hours = Number(match[1]);
  const suffix = hours >= 12 ? "PM" : "AM";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${match[2]} ${suffix}`;
}

/**
 * Each coach's weekly hours as sentences — "Fridays 5:00 PM–10:00 PM" — for
 * the page where a family CHOOSES a coach. Tony, 11 Sep 2026: "they choose
 * the coach with their schedule listed." The schedule belongs at the moment
 * of choosing, not behind the choice.
 */
export async function getCoachScheduleLines(
  staffIds: string[]
): Promise<Record<string, string[]>> {
  const empty: Record<string, string[]> = {};
  if (!isSupabaseConfigured() || staffIds.length === 0) return empty;
  try {
    const { data, error } = await getPortalReadClient()
      .from("v_coaching_availability_public")
      .select("staff_id, weekday, starts_at, ends_at")
      .in("staff_id", staffIds);
    if (error) throw error;

    const byCoach: Record<string, { weekday: number; line: string }[]> = {};
    for (const row of data ?? []) {
      const r = row as {
        staff_id: string;
        weekday: number;
        starts_at: string;
        ends_at: string;
      };
      const name = WEEKDAY_NAMES[Number(r.weekday)] ?? "";
      if (!name) continue;
      (byCoach[r.staff_id] ??= []).push({
        weekday: Number(r.weekday),
        line: `${name} ${wallClock(r.starts_at)}–${wallClock(r.ends_at)}`,
      });
    }
    const lines: Record<string, string[]> = {};
    for (const [staffId, entries] of Object.entries(byCoach)) {
      lines[staffId] = entries
        // Monday first, the way a family reads a week.
        .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
        .map((entry) => entry.line);
    }
    return lines;
  } catch {
    return empty;
  }
}

export type BookingResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string; needsSessions?: boolean };

/**
 * Postgres `P0002` is the one refusal the page can DO something about: the
 * family is out of sessions, so the answer is an offer to buy more rather
 * than an apology. Everything else is already a sentence written for a parent
 * in 0153, so it is passed through unchanged.
 */
function describe(error: {
  code?: string;
  message?: string;
}): { ok: false; error: string; needsSessions?: boolean } {
  const message = (error.message ?? "").replace(/^.*?:\s*/, "").trim();
  return {
    ok: false,
    error: message || "That booking could not be made. Please try again.",
    needsSessions: error.code === "P0002",
  };
}

export async function bookCoachingSession(input: {
  familyId: string;
  studentId: string;
  coachStaffId: string;
  startsAt: string;
  notes?: string;
  /** Which kind of lesson — validated in 0275 against the coach's disciplines. */
  sessionType?: string;
}): Promise<BookingResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Booking is not available just now." };
  }
  try {
    const { data, error } = await getPortalRpcClient().rpc("family_book_coaching", {
      p_family_id: input.familyId,
      p_student_id: input.studentId,
      p_coach_staff_id: input.coachStaffId,
      p_starts_at: input.startsAt,
      p_notes: input.notes ?? null,
      p_session_type: input.sessionType ?? null,
    });
    if (error) return describe(error);
    return { ok: true, sessionId: String(data) };
  } catch (error) {
    return describe(error as { code?: string; message?: string });
  }
}

export type SeriesResult =
  | { ok: true; sessionIds: string[]; count: number }
  | { ok: false; error: string; needsSessions?: boolean };

/**
 * The same slot, week after week — the punch card's standing appointment.
 *
 * All-or-nothing in the portal (0275): if week four clashes, nothing books
 * and the refusal names the clash, so a family never ends up holding half a
 * series. Wall-clock weekly in Eastern time, so the November changeover does
 * not shift the lesson an hour.
 */
export async function bookCoachingSeries(input: {
  familyId: string;
  studentId: string;
  coachStaffId: string;
  startsAt: string;
  count: number;
  sessionType?: string;
  notes?: string;
}): Promise<SeriesResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Booking is not available just now." };
  }
  try {
    const { data, error } = await getPortalRpcClient().rpc(
      "family_book_coaching_series",
      {
        p_family_id: input.familyId,
        p_student_id: input.studentId,
        p_coach_staff_id: input.coachStaffId,
        p_starts_at: input.startsAt,
        p_count: input.count,
        p_session_type: input.sessionType ?? null,
        p_notes: input.notes ?? null,
      }
    );
    if (error) return describe(error);
    const payload = (data ?? {}) as { sessionIds?: unknown; count?: unknown };
    const ids = Array.isArray(payload.sessionIds)
      ? (payload.sessionIds as unknown[]).map(String)
      : [];
    return { ok: true, sessionIds: ids, count: Number(payload.count) || ids.length };
  } catch (error) {
    return describe(error as { code?: string; message?: string });
  }
}

export async function cancelCoachingSession(
  familyId: string,
  sessionId: string,
  reason?: string
): Promise<BookingResult> {
  if (!isSupabaseConfigured()) {
    return { ok: false, error: "Booking is not available just now." };
  }
  try {
    const { data, error } = await getPortalRpcClient().rpc("family_cancel_coaching", {
      p_family_id: familyId,
      p_session_id: sessionId,
      p_reason: reason ?? null,
    });
    if (error) return describe(error);
    // `false` means it was already canceled, already past, or never theirs —
    // 0153 answers all three the same way so a family probing ids learns
    // nothing from the difference.
    return data === true
      ? { ok: true, sessionId }
      : { ok: false, error: "That session could no longer be cancelled." };
  } catch (error) {
    return describe(error as { code?: string; message?: string });
  }
}
