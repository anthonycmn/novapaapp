import "server-only";
import { randomUUID } from "node:crypto";
import { getPortalReadClient, getServiceClient } from "./supabase/client";

/**
 * The schedule bridge: mirrors the STAFF PORTAL's season plan into
 * family-hub calendar events, continuously.
 *
 * When Tony updates the Teen Conservatory calendar (or any show's
 * schedule/curriculum) in the portal, the next sync:
 *   - creates events for new rehearsals/tech/performances/camp days
 *   - updates events whose time/label moved, stamping changed_at and a
 *     change note so families see the "Updated" badge
 *   - removes FUTURE events the portal no longer has (past events are
 *     history and never touched)
 *   - copies each show's curriculum_url onto the hub production
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
  location: string;
}

export interface ScheduleSyncResult {
  desired: number;
  created: number;
  updated: number;
  removed: number;
  adopted: number;
  curriculumSynced: number;
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
    hub.from("productions").select("id, title, curriculum_url"),
    hub.from("classes").select("id, name, day_of_week, start_time, end_time, location"),
    portal.from("productions").select("id, title, starts_on, ends_on, production_type, curriculum_url"),
    portal.from("production_schedule").select("id, production_id, label, day_of_week, starts_at, ends_at, effective_from, effective_to"),
    portal.from("season_events").select("id, kind, title, starts_on, ends_on, production_id"),
  ]);
  if (portalError) throw new Error(`portal read failed: ${portalError.message}`);

  const portalByTitle = new Map((portalProds ?? []).map((p) => [String(p.title), p as Row]));
  const breaks = (seasonEvents ?? []).filter((e) => String(e.kind) === "break");
  const inBreak = (d: string) =>
    breaks.some((b) => d >= String(b.starts_on) && d <= String(b.ends_on));

  /* 1. Compute the desired portal-sourced event set. */
  const desired = new Map<string, DesiredEvent>();
  let curriculumSynced = 0;

  for (const hp of hubProds ?? []) {
    const portalTitle = PORTAL_TITLE_MAP[String(hp.title)];
    const pp = portalTitle ? portalByTitle.get(portalTitle) : undefined;
    if (!pp) continue;
    const show = shortName(String(hp.title));
    const hubProdId = String(hp.id);

    // Curriculum link flows portal → hub production.
    const curriculum = pp.curriculum_url ? String(pp.curriculum_url) : null;
    if ((hp.curriculum_url ?? null) !== curriculum) {
      const { error } = await hub
        .from("productions").update({ curriculum_url: curriculum }).eq("id", hubProdId);
      if (error) throw new Error(`curriculum update: ${error.message}`);
      curriculumSynced++;
    }

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
          desired.set(ref, { ...base, type: "performance", title: `${show} — Performance (time TBA)`,
            startsAt: iso(d, TBA_PERF[0]), endsAt: iso(d, TBA_PERF[1]) });
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
      .select("id, production_id, class_id, type, title, starts_at, ends_at, location, external_ref")
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
          ...(timeMoved
            ? { changed_at: new Date().toISOString(), change_note: "Updated from the season schedule" }
            : {}),
        })
        .eq("id", current.id);
      if (error) throw new Error(`update: ${error.message}`);
      updated++;
    }
  }

  for (let i = 0; i < inserts.length; i += 400) {
    const { error } = await hub.from("calendar_events").insert(inserts.slice(i, i + 400));
    if (error) throw new Error(`insert: ${error.message}`);
  }

  // Remove FUTURE portal-sourced events the plan no longer contains.
  const nowIso = new Date().toISOString();
  const stale = existing.filter(
    (e) =>
      e.external_ref &&
      !desired.has(String(e.external_ref)) &&
      String(e.starts_at) > nowIso
  );
  for (const e of stale) {
    const { error } = await hub.from("calendar_events").delete().eq("id", e.id);
    if (error) throw new Error(`remove: ${error.message}`);
    removed++;
  }

  return { desired: desired.size, created, updated, removed, adopted, curriculumSynced };
}
