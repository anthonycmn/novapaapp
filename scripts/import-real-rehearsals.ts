/**
 * Generate the family hub's calendar from the STAFF PORTAL's season plan
 * (read-only): weekly rehearsal patterns (production_schedule), dated
 * tech/performance/camp events (season_events), and weekly class sessions.
 *
 * Rules:
 *  - only for productions/classes that exist in the hub (i.e. have real
 *    enrolled families) — unmapped portal shows are skipped and listed
 *  - weekly patterns skip the portal's published breaks
 *  - tech/performances carry dates from the portal; times are marked TBA
 *    (staff refine them in the app, which sends change notices)
 *  - camp days use the documented 8:30 AM–4:15 PM camp hours
 *  - idempotent: an event with the same target + start + title is skipped
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/import-real-rehearsals.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set Supabase env vars");
const hub = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});
const portal = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: "staff_portal" },
}) as typeof hub;

/** hub production title → portal production title */
const MAP: Record<string, string> = {
  "Broadway Bound Junior | Frozen, Jr.": "Frozen JR. - Cast B (Ages 9-12)",
  "Broadway Bound | Frozen, Kids": "Frozen KIDS - Cast A (Ages 5-9)",
  "Broadway Bound Teens | Frozen, Jr": "Frozen JR. - Cast C (Ages 12-15)",
  "Broadway Bound Kids | The Little Mermaid, Jr.": "The Little Mermaid KIDS - Cast A (Ages 5-9)",
  "Broadway Bound Junior | The Little Mermaid, Jr.": "The Little Mermaid JR. - Cast B (Ages 9-12)",
  "Sweeney Todd - Teen Conservatory": "Sweeney Todd: School Edition",
  "Hadestown - Teen Conservatory": "Hadestown: Teen Edition",
  "Broadway Bound Teens | Mean Girls": "Mean Girls",
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

/** Mean Girls summer-intensive rehearsal times, from the portal's own
 *  rehearsal_pattern text ("Jun 14-16 4-9 PM; Jun 17-19 & 21-23 9-4"). */
const TIME_OVERRIDES: Record<string, [string, string]> = {
  "2027-06-14": ["16:00", "21:00"],
  "2027-06-17": ["09:00", "16:00"],
  "2027-06-21": ["09:00", "16:00"],
};

const CAMP_HOURS: [string, string] = ["08:30", "16:15"];
const TBA_TECH: [string, string] = ["17:00", "20:00"];
const TBA_PERF: [string, string] = ["19:00", "21:00"];
const CLASS_SEASON = { from: "2026-09-14", to: "2027-06-09" };

/** Eastern-time offset for the 2026–27 season (US DST switches). */
const offset = (d: string) => (d >= "2026-11-01" && d < "2027-03-14" ? "-05:00" : "-04:00");
const iso = (d: string, t: string) => `${d}T${t}:00${offset(d)}`;

function* days(from: string, to: string): Generator<string> {
  const end = new Date(`${to}T12:00:00Z`);
  for (let d = new Date(`${from}T12:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    yield d.toISOString().slice(0, 10);
  }
}
const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Family-facing short show name ("Broadway Bound X | Frozen, Jr." → "Frozen, Jr."). */
const shortName = (hubTitle: string) => hubTitle.split("|").pop()!.trim();

async function main() {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: hubProds }, { data: hubClasses }, { data: existingRows }] = await Promise.all([
    hub.from("productions").select("id, title"),
    hub.from("classes").select("id, name, day_of_week, start_time, end_time, location"),
    hub.from("calendar_events").select("production_id, class_id, starts_at, title").range(0, 9999),
  ]);
  const existing = new Set(
    (existingRows ?? []).map((e) => `${e.production_id ?? e.class_id}|${e.starts_at}|${e.title}`)
  );

  const [{ data: portalProds }, { data: slots }, { data: seasonEvents }] = await Promise.all([
    portal.from("productions").select("id, title, starts_on, ends_on, production_type"),
    portal.from("production_schedule").select("production_id, label, day_of_week, starts_at, ends_at, effective_from, effective_to"),
    portal.from("season_events").select("kind, title, starts_on, ends_on, production_id"),
  ]);
  const portalByTitle = new Map((portalProds ?? []).map((p) => [String(p.title), p]));
  const breaks = (seasonEvents ?? []).filter((e) => String(e.kind) === "break");
  const inBreak = (d: string) =>
    breaks.some((b) => d >= String(b.starts_on) && d <= String(b.ends_on));

  type NewEvent = Record<string, unknown>;
  const events: NewEvent[] = [];
  const push = (targetId: string, isClass: boolean, type: string, title: string, d: string, start: string, end: string, location: string) => {
    const startsAt = iso(d, start);
    if (existing.has(`${targetId}|${startsAt}|${title}`)) return;
    // PostgREST returns timestamps in +00:00 form — normalize the dedupe key too.
    const utcKey = `${targetId}|${new Date(startsAt).toISOString().replace("Z", "+00:00")}|${title}`;
    if (existing.has(utcKey)) return;
    existing.add(utcKey);
    events.push({
      id: randomUUID(),
      type,
      title,
      starts_at: startsAt,
      ends_at: iso(d, end),
      location,
      ...(isClass ? { class_id: targetId } : { production_id: targetId }),
    });
  };

  const unmapped: string[] = [];
  for (const hp of hubProds ?? []) {
    const hubTitle = String(hp.title);
    const portalTitle = MAP[hubTitle];
    const pp = portalTitle ? portalByTitle.get(portalTitle) : undefined;
    if (!pp) {
      unmapped.push(hubTitle);
      continue;
    }
    const show = shortName(hubTitle);
    const isCamp = String(pp.production_type) === "Camp Production";

    // Weekly rehearsal patterns (non-camp).
    for (const slot of (slots ?? []).filter((s) => s.production_id === pp.id)) {
      const from = [String(slot.effective_from), String(pp.starts_on ?? ""), today]
        .filter(Boolean).sort().pop()!;
      for (const d of days(from, String(slot.effective_to))) {
        if (dow(d) !== Number(slot.day_of_week) || inBreak(d)) continue;
        push(String(hp.id), false, "rehearsal", `${show} — ${String(slot.label)}`, d,
          String(slot.starts_at).slice(0, 5), String(slot.ends_at).slice(0, 5), "");
      }
    }

    // Dated events from the season plan.
    for (const se of (seasonEvents ?? []).filter((s) => s.production_id === pp.id)) {
      const kind = String(se.kind);
      for (const d of days(String(se.starts_on), String(se.ends_on))) {
        if (d < today) continue;
        if (kind === "camp") {
          if (dow(d) === 0 || dow(d) === 6) continue; // camps run Mon–Fri
          push(String(hp.id), false, "workshop", `${show} — Camp Day`, d, CAMP_HOURS[0], CAMP_HOURS[1], "");
        } else if (kind === "tech") {
          push(String(hp.id), false, "tech", `${show} — Tech (times TBA)`, d, TBA_TECH[0], TBA_TECH[1], "");
        } else if (kind === "performance") {
          push(String(hp.id), false, "performance", `${show} — Performance (time TBA)`, d, TBA_PERF[0], TBA_PERF[1], "");
        } else if (kind === "audition") {
          push(String(hp.id), false, "other", `${show} — Auditions (times TBA)`, d, "10:00", "14:00", "");
        } else if (kind === "rehearsal" && isCamp === false && String(se.title).includes("—") && String(pp.title) === "Mean Girls") {
          const times = TIME_OVERRIDES[String(se.starts_on)] ?? TBA_TECH;
          push(String(hp.id), false, "rehearsal", `${show} — Rehearsal`, d, times[0], times[1], "");
        }
        // "rehearsal season" range markers duplicate the weekly patterns — skipped.
      }
    }
  }

  // Weekly class sessions across the class season, minus breaks.
  for (const c of hubClasses ?? []) {
    for (const d of days(CLASS_SEASON.from, CLASS_SEASON.to)) {
      if (d < today || dow(d) !== Number(c.day_of_week) || inBreak(d)) continue;
      push(String(c.id), true, "class", String(c.name), d,
        String(c.start_time).slice(0, 5), String(c.end_time).slice(0, 5), String(c.location ?? ""));
    }
  }

  console.log(`events to create: ${events.length}`);
  for (let i = 0; i < events.length; i += 400) {
    const { error } = await hub.from("calendar_events").insert(events.slice(i, i + 400));
    if (error) throw new Error(`insert: ${error.message}`);
  }
  const byType = new Map<string, number>();
  for (const e of events) byType.set(String(e.type), (byType.get(String(e.type)) ?? 0) + 1);
  console.log("by type:", JSON.stringify([...byType.entries()]));
  if (unmapped.length) console.log("hub productions with no portal schedule:", unmapped.join(" · "));
}

main().catch((e) => {
  console.error("REHEARSALS FAILED:", e.message ?? e);
  process.exit(1);
});
