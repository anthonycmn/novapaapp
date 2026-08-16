/**
 * Import the Sweeney Todd production calendar into family_hub.
 *
 * Why this exists, and when to delete it
 * -------------------------------------
 * The designed path for a show's schedule is: staff portal → the hourly
 * schedule-sync job → family calendars. Sweeney's schedule was never entered
 * in the portal, so the parent portal's schedule rail had nothing to show —
 * the bridge was fine, the data was absent.
 *
 * These rows are written with external_source = 'sweeney_ics' so the hourly
 * job cannot touch them: it only ever deletes future events it owns
 * (external_source = 'staff_portal'). That keeps the two writers from
 * fighting, at the cost of a second source of truth for one show.
 *
 * **When Sweeney's schedule goes into the staff portal, delete these rows**
 * (one statement, at the bottom of this file) or families will see every call
 * twice.
 *
 * Idempotent: keyed on external_ref = the iCal UID, so re-running updates in
 * place rather than duplicating.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/import-sweeney-calendar.ts [--apply]
 * Without --apply it prints what it would do and writes nothing.
 */
import { createClient } from "@supabase/supabase-js";

const ICS_URL =
  process.env.SWEENEY_ICS_URL ??
  "https://calendar.google.com/calendar/ical/c_540bcb53f91ebdd3d2e56066df78d9e1cf1bde1d406a99621d5caf314814d6d3%40group.calendar.google.com/private-e5fe706642c22710cd793fcb2ff7ea3b/basic.ics";

const PRODUCTION_ID = "2f57e4a1-c61c-415e-b755-1212709ef141"; // Sweeney Todd - Teen Conservatory
const SOURCE = "sweeney_ics";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

const hub = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: "family_hub" },
});

interface Event {
  uid: string;
  summary: string;
  location: string;
  start: string;
  end: string;
  allDay: boolean;
}

/** Unfold RFC5545 continuation lines (a leading space continues the previous). */
function unfold(ics: string): string[] {
  const out: string[] = [];
  for (const raw of ics.split(/\r?\n/)) {
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) {
      out[out.length - 1] += raw.slice(1);
    } else {
      out.push(raw);
    }
  }
  return out;
}

function unescape(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** "20261023T213000Z" → ISO. "20260907" (all-day) → midnight ET that day. */
function toIso(value: string, allDay: boolean): string {
  if (allDay) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    // Treat an all-day marker as local noon UTC so it lands on the right
    // calendar day in America/New_York without a timezone library.
    return `${y}-${m}-${d}T16:00:00.000Z`;
  }
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  const ss = value.slice(13, 15) || "00";
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}.000Z`;
}

function parse(ics: string): Event[] {
  const lines = unfold(ics);
  const events: Event[] = [];
  let cur: Partial<Event> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.uid && cur.summary && cur.start && cur.end) events.push(cur as Event);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const nameAndParams = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const name = nameAndParams.split(";")[0].toUpperCase();
      if (name === "UID") cur.uid = value.trim();
      else if (name === "SUMMARY") cur.summary = unescape(value);
      else if (name === "LOCATION") cur.location = unescape(value);
      else if (name === "DTSTART") {
        cur.allDay = /VALUE=DATE(?!-TIME)/i.test(nameAndParams);
        cur.start = toIso(value.trim(), cur.allDay);
      } else if (name === "DTEND") {
        cur.end = toIso(value.trim(), /VALUE=DATE(?!-TIME)/i.test(nameAndParams));
      }
    }
  }
  return events;
}

/**
 * Performances are what families buy tickets for and plan around, so they are
 * typed differently from calls. Everything else on this calendar is a
 * rehearsal — including tech, which families must treat as mandatory.
 */
function eventType(summary: string): string {
  const s = summary.toLowerCase();
  if (/opening night|matinee|evening|closing performance/.test(s)) return "performance";
  if (/no rehearsal/.test(s)) return "other";
  return "rehearsal";
}

/** "Sweeney Todd - OPENING NIGHT (call 5:30, curtain 7:00)" → drop the prefix. */
function cleanTitle(summary: string): string {
  return summary.replace(/^Sweeney Todd\s*[-–—]\s*/i, "").trim() || summary;
}

/** The calendar states call times in the title; surface them as a real field. */
function callTime(summary: string, startIso: string): string | null {
  const m = summary.match(/call\s*(\d{1,2}):(\d{2})/i);
  if (!m) return null;
  const start = new Date(startIso);
  // Curtain is the event start; the call is earlier the same day. Both are
  // stated in ET, and the start is already the correct instant, so derive the
  // offset from the stated curtain rather than guessing a timezone.
  const curtain = summary.match(/curtain\s*(\d{1,2}):(\d{2})/i);
  if (!curtain) return null;
  // Both are stated on a 12-hour clock, and every performance is afternoon or
  // evening — so an hour under 8 means PM. Without this, "call 12:30,
  // curtain 2:00" reads as curtain being ten hours BEFORE the call, and the
  // matinees silently lose their call time (4 of the 7 shows).
  const pm = (h: number) => (h < 8 ? h + 12 : h);
  const callMins = pm(Number(m[1])) * 60 + Number(m[2]);
  const curtainMins = pm(Number(curtain[1])) * 60 + Number(curtain[2]);
  const diff = curtainMins - callMins;
  if (diff <= 0 || diff > 6 * 60) return null;
  return new Date(start.getTime() - diff * 60_000).toISOString();
}

async function main() {
  const apply = process.argv.includes("--apply");

  const res = await fetch(ICS_URL);
  if (!res.ok) throw new Error(`Calendar fetch failed: ${res.status}`);
  const events = parse(await res.text());
  console.log(`Parsed ${events.length} events from the Sweeney calendar.`);

  const rows = events.map((e) => ({
    type: eventType(e.summary),
    title: cleanTitle(e.summary),
    starts_at: e.start,
    ends_at: e.end,
    call_time: callTime(e.summary, e.start),
    location: e.location ?? "",
    production_id: PRODUCTION_ID,
    external_source: SOURCE,
    external_ref: e.uid,
  }));

  const perf = rows.filter((r) => r.type === "performance").length;
  console.log(`  ${perf} performances, ${rows.length - perf} calls`);
  const sorted = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  console.log(`  first ${sorted[0]?.starts_at}  last ${sorted[sorted.length - 1]?.starts_at}`);
  console.log(`  ${rows.filter((r) => r.call_time).length} with a call time`);

  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write.");
    for (const r of rows.slice(0, 5)) console.log("   ", r.starts_at, r.type, r.title);
    return;
  }

  const { data: existing, error: readErr } = await hub
    .from("calendar_events")
    .select("id, external_ref")
    .eq("external_source", SOURCE)
    .eq("production_id", PRODUCTION_ID);
  if (readErr) throw new Error(readErr.message);
  const byRef = new Map((existing ?? []).map((r) => [r.external_ref, r.id]));

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const id = byRef.get(row.external_ref);
    if (id) {
      const { error } = await hub.from("calendar_events").update(row).eq("id", id);
      if (error) throw new Error(`update ${row.external_ref}: ${error.message}`);
      updated++;
      byRef.delete(row.external_ref);
    } else {
      const { error } = await hub.from("calendar_events").insert(row);
      if (error) throw new Error(`insert ${row.external_ref}: ${error.message}`);
      inserted++;
    }
  }

  // Anything left in byRef was removed from the calendar upstream.
  let removed = 0;
  for (const [, id] of byRef) {
    const { error } = await hub.from("calendar_events").delete().eq("id", id);
    if (error) throw new Error(`delete ${id}: ${error.message}`);
    removed++;
  }

  console.log(`\nApplied: ${inserted} inserted, ${updated} updated, ${removed} removed.`);
  console.log(
    "To undo entirely:\n" +
      `  delete from family_hub.calendar_events where external_source = '${SOURCE}';`
  );
}

main().catch((e) => {
  console.error("IMPORT FAILED:", e.message ?? e);
  process.exit(1);
});
