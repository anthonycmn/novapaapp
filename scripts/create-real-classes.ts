/**
 * Create hub CLASSES from the website's class activities (the ones real
 * orders reference), with day/time parsed from the activity's own
 * class_times. Names carry the age range ("Acting (9 – 12 yrs)") because
 * the website has same-named sections — matching what the bridge emits.
 * Coaching products (no schedule; booked ad hoc) are skipped — they'll
 * connect through private lessons when real teachers/slots exist.
 *
 * Idempotent. Run: npx tsx --tsconfig scripts/tsconfig.json scripts/create-real-classes.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { classOfferingName, type ActivityInfo } from "../src/lib/api/registration/website";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Set Supabase env vars");
const hub = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});
const website = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: "public" },
}) as typeof hub;

const SEASON_NAME = "Broadway Bound 2026–27";
const PROGRAM_NAME = "Year-Round Classes";

const DAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function to24h(t: string): string | undefined {
  const m = /(\d{1,2}):(\d{2})\s*(am|pm)/i.exec(t);
  if (!m) return undefined;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

async function main() {
  const { data: activities, error } = await website
    .from("activities")
    .select("id, name, category, age_range, location, class_times")
    .eq("category", "class")
    .in("id", [
      ...new Set(
        ((await website.from("order_items").select("activity_id").not("activity_id", "is", null)).data ?? [])
          .map((r) => r.activity_id)
      ),
    ]);
  if (error) throw new Error(error.message);

  const { data: seasons } = await hub.from("seasons").select("id, name");
  const seasonId = seasons?.find((s) => s.name === SEASON_NAME)?.id;
  if (!seasonId) throw new Error(`season "${SEASON_NAME}" not found`);

  const { data: programs } = await hub.from("programs").select("id, name");
  let programId = programs?.find((p) => p.name === PROGRAM_NAME)?.id as string | undefined;
  if (!programId) {
    programId = randomUUID();
    const { error: pErr } = await hub.from("programs").insert({
      id: programId,
      season_id: seasonId,
      name: PROGRAM_NAME,
      description: "Weekly classes (imported from the registration system)",
    });
    if (pErr) throw new Error(pErr.message);
    console.log(`program created: ${PROGRAM_NAME}`);
  }

  const { data: existing } = await hub.from("classes").select("name");
  const have = new Set((existing ?? []).map((c) => String(c.name).trim().toLowerCase()));

  let created = 0;
  for (const activity of activities ?? []) {
    const info: ActivityInfo = {
      name: String(activity.name),
      category: String(activity.category),
      ageRange: activity.age_range ? String(activity.age_range) : undefined,
    };
    const className = classOfferingName(info);
    if (have.has(className.trim().toLowerCase())) continue;

    const slot = Array.isArray(activity.class_times) ? (activity.class_times[0] as Record<string, unknown>) : null;
    const day = slot ? DAY[String(slot.title_text)] : undefined;
    const times = slot && Array.isArray(slot.primary_text) ? String(slot.primary_text[0]) : "";
    const [startRaw, endRaw] = times.split("-").map((s) => s.trim());
    const start = startRaw ? to24h(startRaw) : undefined;
    const end = endRaw ? to24h(endRaw) : undefined;
    if (day === undefined || !start || !end) {
      console.log(`  SKIPPED (no parseable schedule): ${className}`);
      continue;
    }
    const location = String(activity.location ?? "").split(",")[0] || "";

    const { error: cErr } = await hub.from("classes").insert({
      id: randomUUID(),
      program_id: programId,
      name: className,
      day_of_week: day,
      start_time: start,
      end_time: end,
      location,
    });
    if (cErr) throw new Error(`${className}: ${cErr.message}`);
    console.log(`  created: ${className} — ${String(slot!.title_text)} ${start}–${end} @ ${location}`);
    created++;
  }
  console.log(`classes created: ${created}`);
}

main().catch((e) => {
  console.error("CLASSES FAILED:", e.message ?? e);
  process.exit(1);
});
