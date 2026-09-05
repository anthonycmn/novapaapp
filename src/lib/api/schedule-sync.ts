import "server-only";
import { randomUUID } from "node:crypto";
import { icalOwnedProductionIds } from "@/lib/ical/feeds";
import { getPortalReadClient, getServiceClient } from "./supabase/client";
import { fetchPublishedRuns, runOpeningOn, type PublishedRun } from "./curtains-source";

/**
 * The schedule bridge: mirrors the STAFF PORTAL's season plan into
 * family-hub calendar events, continuously.
 *
 * When Tony updates the Teen Conservatory calendar (or any show's
 * schedule) in the portal, the next sync:
 *   - creates events for new rehearsals/tech/performances/camp days
 *   - updates events whose time/label moved, stamping changed_at and a
 *     change note so families see the "Updated" badge
 *   - removes FUTURE events the portal no longer has (past events are
 *     history and never touched)
 *
 * Every mirrored event carries external_ref (`ps:<slot>:<date>`,
 * `se:<event>:<date>`, `class:<class>:<date>`) — the stable identity
 * reconciliation keys on. Events staff create by hand in the app have
 * no ref and are never touched by the bridge.
 *
 * READ-ONLY toward the portal, always.
 */

/** hub production title → portal production title */
const PORTAL_TITLE_MAP: Record<string, string> = {
  "Broadway Bound Junior | Frozen, Jr.": "Frozen JR. - Cast B (Ages 9-12)",
  "Broadway Bound | Frozen, Kids": "Frozen KIDS - Cast A (Ages 5-9)",
  "Broadway Bound Teens | Frozen, Jr": "Frozen JR. - Cast C (Ages 12-15)",
  "Broadway Bound Kids | The Little Mermaid, Jr.": "The Little Mermaid KIDS - Cast A (Ages 5-9)",
  "Broadway Bound Junior | The Little Mermaid, Jr.": "The Little Mermaid JR. - Cast B (Ages 9-12)",
  "Sweeney Todd - Teen Conservatory": "Sweeney Todd: School Edition",
  "Hadestown - Teen Conservatory": "Hadestown: Teen Edition",
  "Broadway Bound Teens | Mean Girls": "Mean Girls",
  "Dear Evan Hansen — Triple Threat Teen Intensive": "Dear Evan Hansen",
  "Charlie and the Chocolate Factory (5-9)": "Charlie and the Chocolate Factory Jr.",
  "Charlie and the Chocolate Factory (9-12)": "Charlie and the Chocolate Factory Jr.",
  "Charlie and the Chocolate Factory (12-15)": "Charlie and the Chocolate Factory Jr.",
  "Charlie and the Chocolate Factory (tech)": "Charlie and the Chocolate Factory Jr.",
  "How to Train Your Dragon (5-9)": "How to Train Your Dragon Jr.",
  "How to Train Your Dragon (9-12)": "How to Train Your Dragon Jr.",
  "How to Train Your Dragon (12-15)": "How to Train Your Dragon Jr.",
  "How to Train Your Dragon (tech)": "How to Train Your Dragon Jr.",
  "Trolls, Jr. (5-9)": "Trolls Jr.",
  "Trolls, Jr. (9-12)": "Trolls Jr.",
  "Trolls, Jr. (12-15)": "Trolls Jr.",
  "Trolls, Jr. (tech)": "Trolls Jr.",
};

/** Mean Girls summer-intensive times, from the portal's rehearsal_pattern text. */
const TIME_OVERRIDES: Record<string, [string, string]> = {
  "2027-06-14": ["16:00", "21:00"],
  "2027-06-17": ["09:00", "16:00"],
  "2027-06-21": ["09:00", "16:00"],
};

const CAMP_HOURS: [string, string] = ["08:30", "16:15"];
const TBA_TECH: [string, string] = ["17:00", "20:00"];
const TBA_PERF: [string, string] = ["19:00", "21:00"];

/** An hour before curtain, as an instant rather than a wall-clock string. */
const CALL_MINUTES_BEFORE = 60;
function callFor(startsAt: string): string {
  return new Date(Date.parse(startsAt) - CALL_MINUTES_BEFORE * 60_000).toISOString();
}
const CLASS_SEASON = { from: "2026-09-14", to: "2027-06-09" };

/* ── Eastern-time helpers ──────────────────────────────────────────────── */

/** nth weekday-of-month as YYYY-MM-DD (e.g. 2nd Sunday of March). */
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const offsetDays = (weekday - first.getUTCDay() + 7) % 7 + (n - 1) * 7;
  return new Date(Date.UTC(year, month, 1 + offsetDays)).toISOString().slice(0, 10);
}

/** US Eastern UTC offset for a date: EDT between 2nd Sun of Mar and 1st Sun of Nov. */
function easternOffset(date: string): string {
  const year = Number(date.slice(0, 4));
  const dstStart = nthWeekday(year, 2, 0, 2); // March, Sunday, 2nd
  const dstEnd = nthWeekday(year, 10, 0, 1); // November, Sunday, 1st
  return date >= dstStart && date < dstEnd ? "-04:00" : "-05:00";
}

const iso = (d: string, t: string) => `${d}T${t}:00${easternOffset(d)}`;

function* days(from: string, to: string): Generator<string> {
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(`${from}T12:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const shortName = (hubTitle: string) => hubTitle.split("|").pop()!.trim();
/** timestamptz values compare reliably as epochs, never as strings. */
const sameInstant = (a: unknown, b: unknown) => Date.parse(String(a)) === Date.parse(String(b));

/**
 * The same, where "neither has one" counts as equal.
 *
 * sameInstant(null, null) is NaN === NaN, which is false — so comparing a
 * call time that is absent on both sides with it would mark every rehearsal
 * changed on every run, and the sync would rewrite the whole calendar nightly
 * and report it as news.
 */
const sameNullableInstant = (a: unknown, b: unknown) =>
  a == null && b == null ? true : a == null || b == null ? false : sameInstant(a, b);

/* ── the sync ──────────────────────────────────────────────────────────── */

type Row = Record<string, unknown>;

interface DesiredEvent {
  ref: string;
  productionId?: string;
  classId?: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string;
  /**
   * When to be there — CJ, 4 Sep 2026: "the call time is 60 minutes before the
   * show."
   *
   * Derived rather than typed, so it cannot drift from the performance it
   * belongs to: move the show and the call moves with it. Only performances
   * carry one; a rehearsal's start IS its call.
   */
  callTime?: string;
  location: string;
}

export interface ScheduleSyncResult {
  desired: number;
  created: number;
  updated: number;
  removed: number;
  adopted: number;
  staffAssignmentsSynced: number;
  /** Families told that something of theirs moved or came off the calendar. */
  familiesNotified: number;
}

/** One thing that happened to one family's calendar in this run. */
interface CalendarChange {
  kind: "moved" | "canceled";
  productionId: string | null;
  classId: string | null;
  title: string;
  /** The new time for a move, the lost one for a cancellation. */
  startsAt: string;
}

/** "Thu, Sep 4, 5:00 PM" in the timezone every family in the org is in. */
function whenText(startsAt: string): string {
  return new Date(startsAt).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

/**
 * Tell the families whose children are actually in it that the calendar moved.
 *
 * CJ, 2 Sep 2026: "I would like for notifications to pop up whenever we make an
 * adjustment to the calendar." Until now the bridge changed the time on the row
 * and stamped an "Updated" badge, and whether a parent ever saw it depended on
 * them opening the calendar page before the rehearsal they no longer had the
 * right time for.
 *
 * ONE notification per family per run, not one per event. A schedule is
 * re-planned in blocks — a tech week shifts, a camp week is cut — and eleven
 * separate "a rehearsal moved" notices for the same evening's work is how a
 * family learns to ignore the bell. So the run collects everything it did,
 * groups it by family, and sends a single line: what moved, what came off, and
 * the first few by name.
 *
 * Only FUTURE changes are announced. The reconciler never touches past events,
 * and a correction to something that already happened is not news.
 */
async function announceScheduleChanges(
  hub: ReturnType<typeof getServiceClient>,
  changes: CalendarChange[]
): Promise<number> {
  const upcoming = changes.filter((c) => c.startsAt > new Date().toISOString());
  if (!upcoming.length) return 0;

  const [{ data: enrollments }, { data: students }, { data: parents }, { data: prefs }] =
    await Promise.all([
      hub
        .from("enrollments")
        .select("student_id, class_id, production_id, status")
        .eq("status", "enrolled"),
      hub.from("students").select("id, family_id"),
      hub.from("profiles").select("id, family_id").eq("role", "parent"),
      hub.from("notification_prefs").select("user_id, enabled"),
    ]);

  const familyOfStudent = new Map(
    ((students ?? []) as Row[]).map((st) => [String(st.id), String(st.family_id)])
  );

  /* family -> the changes touching a show or class one of their children is in */
  const byFamily = new Map<string, CalendarChange[]>();
  for (const enrollment of (enrollments ?? []) as Row[]) {
    const familyId = familyOfStudent.get(String(enrollment.student_id));
    if (!familyId) continue;
    for (const change of upcoming) {
      const mine =
        (change.productionId && String(enrollment.production_id) === change.productionId) ||
        (change.classId && String(enrollment.class_id) === change.classId);
      if (!mine) continue;
      const list = byFamily.get(familyId) ?? [];
      // Two children in the same show must not double the list.
      if (!list.includes(change)) list.push(change);
      byFamily.set(familyId, list);
    }
  }
  if (!byFamily.size) return 0;

  const optedOut = new Set(
    ((prefs ?? []) as Row[])
      .filter((p) => ((p.enabled ?? {}) as Record<string, boolean>).schedule_change === false)
      .map((p) => String(p.user_id))
  );

  const rows: Row[] = [];
  let families = 0;
  for (const [familyId, list] of byFamily) {
    const recipients = ((parents ?? []) as Row[]).filter(
      (p) => String(p.family_id) === familyId && !optedOut.has(String(p.id))
    );
    if (!recipients.length) continue;

    const moved = list.filter((c) => c.kind === "moved").length;
    const canceled = list.filter((c) => c.kind === "canceled").length;
    const movedText = moved === 1 ? "1 time changed" : moved + " times changed";
    const canceledText = canceled === 1 ? "1 canceled" : canceled + " canceled";
    const headline =
      moved && canceled
        ? movedText + ", " + canceledText
        : moved
          ? movedText
          : canceledText;

    const named = list
      .slice(0, 3)
      .map(
        (c) =>
          c.title +
          " — " +
          whenText(c.startsAt) +
          (c.kind === "canceled" ? " (canceled)" : "")
      )
      .join("; ");
    const rest = list.length > 3 ? " …and " + (list.length - 3) + " more." : "";

    for (const parent of recipients) {
      rows.push({
        user_id: parent.id,
        type: "schedule_change",
        title: "Your calendar changed",
        body: headline + ". " + named + "." + rest + " Open the calendar for the full week.",
        url: "/calendar",
      });
    }
    families += 1;
  }

  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await hub.from("notifications").insert(rows.slice(i, i + 400));
    if (error) throw new Error(`schedule notice: ${error.message}`);
  }
  return families;
}

/**
 * Mirror the portal's production staffing into hub production_staff so
 * "My Shows" knows who works what. The table is bridge-owned: rows the
 * portal no longer has are removed. Portal people without a hub account
 * (no portal_users row) are skipped until they get one.
 */
async function syncProductionStaff(
  hubProdsByPortalId: Map<string, string[]>
): Promise<number> {
  const hub = getServiceClient();
  const portal = getPortalReadClient();

  const [
    { data: assignments },
    { data: roles },
    { data: portalUsers },
    { data: hubStaff },
  ] = await Promise.all([
    portal.from("production_assignments").select("production_id, role_id, staff_id, is_not_needed"),
    portal.from("production_roles").select("id, name"),
    portal.from("portal_users").select("staff_id, auth_user_id"),
    hub.from("staff_profiles").select("id, user_id"),
  ]);

  const roleName = new Map((roles ?? []).map((r) => [String(r.id), String(r.name)]));
  const authByPortalStaff = new Map(
    (portalUsers ?? [])
      .filter((u) => u.staff_id && u.auth_user_id)
      .map((u) => [String(u.staff_id), String(u.auth_user_id)])
  );
  const hubStaffByUser = new Map(
    (hubStaff ?? []).filter((s) => s.user_id).map((s) => [String(s.user_id), String(s.id)])
  );

  const desired = new Map<string, Row>();
  const directors = new Map<string, string>(); // hub production → hub staff
  for (const a of assignments ?? []) {
    if (a.is_not_needed || !a.staff_id) continue;
    const authId = authByPortalStaff.get(String(a.staff_id));
    const staffId = authId ? hubStaffByUser.get(authId) : undefined;
    if (!staffId) continue;
    const role = roleName.get(String(a.role_id)) ?? "Staff";
    for (const hubProdId of hubProdsByPortalId.get(String(a.production_id)) ?? []) {
      desired.set(`${hubProdId}|${staffId}|${role}`, {
        production_id: hubProdId,
        staff_id: staffId,
        role,
      });
      if (role === "Director") directors.set(hubProdId, staffId);
    }
  }

  const { data: current } = await hub
    .from("production_staff").select("production_id, staff_id, role").range(0, 4999);
  const currentKeys = new Set(
    (current ?? []).map((r) => `${r.production_id}|${r.staff_id}|${r.role}`)
  );

  let changes = 0;
  const inserts = [...desired.entries()]
    .filter(([key]) => !currentKeys.has(key))
    .map(([, row]) => row);
  if (inserts.length > 0) {
    const { error } = await hub.from("production_staff").insert(inserts);
    if (error) throw new Error(`production_staff insert: ${error.message}`);
    changes += inserts.length;
  }
  for (const row of current ?? []) {
    const key = `${row.production_id}|${row.staff_id}|${row.role}`;
    if (!desired.has(key)) {
      const { error } = await hub
        .from("production_staff")
        .delete()
        .eq("production_id", row.production_id)
        .eq("staff_id", row.staff_id)
        .eq("role", row.role);
      if (error) throw new Error(`production_staff delete: ${error.message}`);
      changes++;
    }
  }

  for (const [hubProdId, staffId] of directors) {
    const { error } = await hub
      .from("productions")
      .update({ director_staff_id: staffId })
      .eq("id", hubProdId)
      .neq("director_staff_id", staffId);
    if (error) throw new Error(`director update: ${error.message}`);
  }

  return changes;
}

export async function syncPortalSchedule(): Promise<ScheduleSyncResult> {
  const hub = getServiceClient();
  const portal = getPortalReadClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: hubProds },
    { data: hubClasses },
    { data: portalProds, error: portalError },
    { data: slots },
    { data: seasonEvents },
  ] = await Promise.all([
    hub.from("productions").select("id, title"),
    hub.from("classes").select("id, name, day_of_week, start_time, end_time, location"),
    portal.from("productions").select("id, title, starts_on, ends_on, production_type"),
    portal.from("production_schedule").select("id, production_id, label, day_of_week, starts_at, ends_at, effective_from, effective_to"),
    portal.from("season_events").select("id, kind, title, starts_on, ends_on, production_id"),
  ]);
  if (portalError) throw new Error(`portal read failed: ${portalError.message}`);

  const portalByTitle = new Map((portalProds ?? []).map((p) => [String(p.title), p as Row]));
  const breaks = (seasonEvents ?? []).filter((e) => String(e.kind) === "break");

  /*
   * Curtain times, read from novapa.org — CJ, 4 Sep 2026: "I dont want you to
   * invent anything - I want it to pull the information from novapa.org."
   *
   * Fetched once for the whole run, and parsed per production against that
   * production's own opening year (see below), because the website writes
   * "Jan 22" without a year.
   */
  const publishedByYear = new Map<number, PublishedRun[]>();
  const publishedFor = async (year: number): Promise<PublishedRun[]> => {
    const cached = publishedByYear.get(year);
    if (cached) return cached;
    const runs = await fetchPublishedRuns(year);
    publishedByYear.set(year, runs);
    return runs;
  };
  const inBreak = (d: string) =>
    breaks.some((b) => d >= String(b.starts_on) && d <= String(b.ends_on));

  /* 1. Compute the desired portal-sourced event set. */
  const desired = new Map<string, DesiredEvent>();
  const hubProdsByPortalId = new Map<string, string[]>();

  // Dynamic since the feed list moved to the database: connecting a calendar
  // on the staff show page hands that show to the iCal sync on the same run.
  const icalOwned = await icalOwnedProductionIds();

  for (const hp of hubProds ?? []) {
    // A show whose calendar comes from an iCal feed has exactly one writer.
    // Generating portal-sourced events for it too would show families every
    // call twice; skipping it here also means the stale sweep below removes
    // any portal rows this show still has from before the feed took over.
    if (icalOwned.has(String(hp.id))) continue;
    const portalTitle = PORTAL_TITLE_MAP[String(hp.title)];
    const pp = portalTitle ? portalByTitle.get(portalTitle) : undefined;
    if (!pp) continue;
    const show = shortName(String(hp.title));
    const hubProdId = String(hp.id);
    hubProdsByPortalId.set(String(pp.id), [
      ...(hubProdsByPortalId.get(String(pp.id)) ?? []),
      hubProdId,
    ]);

    // Curriculum deliberately does NOT sync (Tony, 2026-08-15): it lives in
    // the STAFF PORTAL only — the family hub never carries or serves it.

    for (const slot of (slots ?? []).filter((s) => s.production_id === pp.id)) {
      const from = [String(slot.effective_from), String(pp.starts_on ?? ""), today]
        .filter(Boolean).sort().pop()!;
      for (const d of days(from, String(slot.effective_to))) {
        if (dow(d) !== Number(slot.day_of_week) || inBreak(d)) continue;
        const ref = `ps:${slot.id}:${d}:${hubProdId}`;
        desired.set(ref, {
          ref,
          productionId: hubProdId,
          type: "rehearsal",
          title: `${show} — ${String(slot.label)}`,
          startsAt: iso(d, String(slot.starts_at).slice(0, 5)),
          endsAt: iso(d, String(slot.ends_at).slice(0, 5)),
          location: "",
        });
      }
    }

    for (const se of (seasonEvents ?? []).filter((s) => s.production_id === pp.id)) {
      const kind = String(se.kind);
      for (const d of days(String(se.starts_on), String(se.ends_on))) {
        if (d < today) continue;
        const ref = `se:${se.id}:${d}:${hubProdId}`;
        const base = { ref, productionId: hubProdId, location: "" };
        if (kind === "camp") {
          if (dow(d) === 0 || dow(d) === 6) continue;
          desired.set(ref, { ...base, type: "workshop", title: `${show} — Camp Day`,
            startsAt: iso(d, CAMP_HOURS[0]), endsAt: iso(d, CAMP_HOURS[1]) });
        } else if (kind === "tech") {
          desired.set(ref, { ...base, type: "tech", title: `${show} — Tech (times TBA)`,
            startsAt: iso(d, TBA_TECH[0]), endsAt: iso(d, TBA_TECH[1]) });
        } else if (kind === "performance") {
          /*
           * Handled below, from the published times, rather than one-per-day at
           * a hard-coded hour. Skipped here so a day in the range that has no
           * curtain on it — the Sunday of a Friday/Saturday run — stops
           * appearing on a family's calendar as a show.
           */
          continue;
        } else if (kind === "audition") {
          desired.set(ref, { ...base, type: "other", title: `${show} — Auditions (times TBA)`,
            startsAt: iso(d, "10:00"), endsAt: iso(d, "14:00") });
        } else if (kind === "rehearsal" && String(pp.production_type) !== "Mainstage") {
          continue; // range markers duplicate weekly patterns
        } else if (kind === "rehearsal" && String(pp.title) === "Mean Girls") {
          const times = TIME_OVERRIDES[String(se.starts_on)] ?? TBA_TECH;
          desired.set(ref, { ...base, type: "rehearsal", title: `${show} — Rehearsal`,
            startsAt: iso(d, times[0]), endsAt: iso(d, times[1]) });
        }
      }

      /*
       * The performances, as novapa.org publishes them.
       *
       * Matched on the day the run opens — the one fact the website and the
       * portal already agree on — and parsed against that opening date's year,
       * because the site writes "Jan 22" with no year on it.
       *
       * No match, or a row that would not parse, means NOTHING is written for
       * this show. That is deliberate: the previous behaviour invented three
       * nights at 7pm and got Frozen KIDS wrong in a way nobody could see. A
       * missing performance is a visible problem; a confident wrong curtain is
       * not, and it is the one that puts a family outside a locked building.
       */
      if (kind === "performance") {
        const opensOn = String(se.starts_on);
        const published = runOpeningOn(
          await publishedFor(Number(opensOn.slice(0, 4))),
          opensOn
        );
        if (published) {
          for (const curtain of published.curtains) {
            if (curtain.date < today) continue;
            const perfRef = `se:${se.id}:${curtain.date}T${curtain.time}:${hubProdId}`;
            const startsAt = iso(curtain.date, curtain.time);
            desired.set(perfRef, {
              ref: perfRef,
              productionId: hubProdId,
              location: "",
              type: "performance",
              title: `${show} — Performance`,
              startsAt,
              /* Sixty minutes before curtain, derived so it follows the show. */
              endsAt: new Date(Date.parse(startsAt) + 2 * 60 * 60_000).toISOString(),
              callTime: callFor(startsAt),
            });
          }
        }
      }
    }
  }

  for (const c of hubClasses ?? []) {
    for (const d of days(CLASS_SEASON.from, CLASS_SEASON.to)) {
      if (d < today || dow(d) !== Number(c.day_of_week) || inBreak(d)) continue;
      const ref = `class:${c.id}:${d}`;
      desired.set(ref, {
        ref,
        classId: String(c.id),
        type: "class",
        title: String(c.name),
        startsAt: iso(d, String(c.start_time).slice(0, 5)),
        endsAt: iso(d, String(c.end_time).slice(0, 5)),
        location: String(c.location ?? ""),
      });
    }
  }

  /* 2. Load current hub events and reconcile. */
  const existing: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await hub
      .from("calendar_events")
      .select("id, production_id, class_id, type, title, starts_at, ends_at, location, external_ref, external_source")
      .range(from, from + 999);
    if (error) throw new Error(`events read: ${error.message}`);
    existing.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const byRef = new Map(existing.filter((e) => e.external_ref).map((e) => [String(e.external_ref), e]));
  // Legacy adoption: events created by the initial import have no ref yet.
  const unrefByKey = new Map(
    existing
      .filter((e) => !e.external_ref)
      .map((e) => [
        `${e.production_id ?? e.class_id}|${Date.parse(String(e.starts_at))}|${e.title}`,
        e,
      ])
  );

  let created = 0, updated = 0, adopted = 0, removed = 0;
  const inserts: Row[] = [];
  /* What families are told about at the end of the run — announceScheduleChanges. */
  const changes: CalendarChange[] = [];

  for (const want of desired.values()) {
    const current = byRef.get(want.ref);
    if (!current) {
      const legacy = unrefByKey.get(
        `${want.productionId ?? want.classId}|${Date.parse(want.startsAt)}|${want.title}`
      );
      if (legacy) {
        const { error } = await hub
          .from("calendar_events")
          .update({ external_ref: want.ref, external_source: "staff_portal" })
          .eq("id", legacy.id);
        if (error) throw new Error(`adopt: ${error.message}`);
        adopted++;
        continue;
      }
      inserts.push({
        id: randomUUID(),
        type: want.type,
        title: want.title,
        starts_at: want.startsAt,
        ends_at: want.endsAt,
        call_time: want.callTime ?? null,
        location: want.location,
        production_id: want.productionId ?? null,
        class_id: want.classId ?? null,
        external_source: "staff_portal",
        external_ref: want.ref,
      });
      created++;
      continue;
    }
    const changed =
      !sameInstant(current.starts_at, want.startsAt) ||
      !sameInstant(current.ends_at, want.endsAt) ||
      !sameNullableInstant(current.call_time, want.callTime ?? null) ||
      String(current.title) !== want.title ||
      String(current.type) !== want.type;
    if (changed) {
      const timeMoved = !sameInstant(current.starts_at, want.startsAt);
      const { error } = await hub
        .from("calendar_events")
        .update({
          type: want.type,
          title: want.title,
          starts_at: want.startsAt,
          ends_at: want.endsAt,
          call_time: want.callTime ?? null,
          ...(timeMoved
            ? { changed_at: new Date().toISOString(), change_note: "Updated from the season schedule" }
            : {}),
        })
        .eq("id", current.id);
      if (error) throw new Error(`update: ${error.message}`);
      updated++;
      // A retitled or retyped event is bookkeeping; a MOVED one is news.
      if (timeMoved) {
        changes.push({
          kind: "moved",
          productionId: want.productionId ?? null,
          classId: want.classId ?? null,
          title: want.title,
          startsAt: want.startsAt,
        });
      }
    }
  }

  for (let i = 0; i < inserts.length; i += 400) {
    const { error } = await hub.from("calendar_events").insert(inserts.slice(i, i + 400));
    if (error) throw new Error(`insert: ${error.message}`);
  }

  /**
   * Remove FUTURE portal-sourced events the plan no longer contains.
   *
   * The external_source check is load-bearing and was missing: this filter
   * matched ANY event carrying an external_ref, so every hour it deleted the
   * rows written by the iCal import — which is why a 62-event Sweeney import
   * left no trace in the database. The job may only delete what it wrote.
   */
  const nowIso = new Date().toISOString();
  const stale = existing.filter(
    (e) =>
      e.external_ref &&
      String(e.external_source ?? "staff_portal") === "staff_portal" &&
      !desired.has(String(e.external_ref)) &&
      String(e.starts_at) > nowIso
  );
  for (const e of stale) {
    const { error } = await hub.from("calendar_events").delete().eq("id", e.id);
    if (error) throw new Error(`remove: ${error.message}`);
    removed++;
    /*
     * A handover is not a cancellation. When a show's calendar moves to an
     * iCal feed, this sweep removes the season-plan placeholders the feed
     * has just replaced with the real schedule — and telling seventy Frozen
     * families "24 canceled" about rehearsals that are very much happening
     * is how the first thing the new calendar does is start a panic. Only a
     * removal from a show this job still owns is news.
     */
    if (e.production_id && icalOwned.has(String(e.production_id))) continue;
    changes.push({
      kind: "canceled",
      productionId: e.production_id ? String(e.production_id) : null,
      classId: e.class_id ? String(e.class_id) : null,
      title: String(e.title),
      startsAt: String(e.starts_at),
    });
  }

  const staffAssignmentsSynced = await syncProductionStaff(hubProdsByPortalId);
  const familiesNotified = await announceScheduleChanges(hub, changes);

  return {
    desired: desired.size,
    created,
    updated,
    removed,
    adopted,
    staffAssignmentsSynced,
    familiesNotified,
  };
}
