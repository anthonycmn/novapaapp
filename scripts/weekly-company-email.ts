/**
 * Build the weekly Sweeney Todd company email — one individualized message
 * per student, from live casting and live calendar data.
 *
 * Run:
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/weekly-company-email.ts \
 *     --from 2026-08-30 --to 2026-09-05 --out <dir>
 *
 * Writes one .html per student plus manifest.json (recipients, subjects, call
 * counts). It does NOT send and does NOT queue — rendering is deliberately
 * separated from delivery so the whole cohort can be read before anyone
 * decides to mail it.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildPackets,
  renderStudentEmail,
  type CastRow,
  type EventRow,
  type RoleRow,
  type WeekMeta,
} from "../src/lib/email/weekly-company";

const SWEENEY = "2f57e4a1-c61c-415e-b755-1212709ef141";
const PORTAL = "https://portal.novapa.org";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

async function main() {
  const from = arg("from", "2026-08-30");
  const to = arg("to", "2026-09-05");
  const outDir = arg("out", "email-out");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, key, {
    db: { schema: "family_hub" },
    auth: { persistSession: false },
  });

  /* casting — every publish; buildPackets keeps only the newest per student */
  const { data: castRaw, error: castError } = await db
    .from("casting_assignments")
    .select("student_id, character_name, rehearsal_track, published_at, students(first_name, last_name, preferred_name, family_id)")
    .eq("production_id", SWEENEY);
  if (castError) throw new Error(`casting: ${castError.message}`);

  const cast: CastRow[] = (castRaw ?? []).map((row: Record<string, unknown>) => {
    const student = row.students as Record<string, unknown>;
    return {
      studentId: String(row.student_id),
      familyId: String(student.family_id),
      firstName: String(student.first_name ?? ""),
      lastName: String(student.last_name ?? ""),
      preferredName: (student.preferred_name as string | null) ?? null,
      characterName: String(row.character_name ?? ""),
      rehearsalTrack: (row.rehearsal_track as string | null) ?? null,
      publishedAt: String(row.published_at ?? ""),
    };
  });

  /* the week's calls */
  const { data: eventsRaw, error: eventsError } = await db
    .from("calendar_events")
    .select("id, title, starts_at, ends_at, location, called_note, works_note, role_ids")
    .eq("production_id", SWEENEY)
    .gte("starts_at", `${from}T00:00:00-04:00`)
    .lte("starts_at", `${to}T23:59:59-04:00`)
    .order("starts_at");
  if (eventsError) throw new Error(`events: ${eventsError.message}`);

  const events: EventRow[] = (eventsRaw ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    startsAt: String(row.starts_at),
    endsAt: (row.ends_at as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    calledNote: (row.called_note as string | null) ?? null,
    worksNote: (row.works_note as string | null) ?? null,
    roleIds: (row.role_ids as string[] | null) ?? null,
  }));

  const { data: rolesRaw, error: rolesError } = await db
    .from("show_roles").select("id, name").eq("production_id", SWEENEY);
  if (rolesError) throw new Error(`roles: ${rolesError.message}`);
  const roles: RoleRow[] = (rolesRaw ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), name: String(r.name),
  }));

  /* who each student's email actually goes to */
  const { data: guardiansRaw, error: guardiansError } = await db
    .from("guardians").select("family_id, full_name, email");
  if (guardiansError) throw new Error(`guardians: ${guardiansError.message}`);
  const guardiansByFamily = new Map<string, { name: string; email: string }[]>();
  for (const row of guardiansRaw ?? []) {
    const email = String((row as Record<string, unknown>).email ?? "").trim().toLowerCase();
    if (!email) continue;
    const familyId = String((row as Record<string, unknown>).family_id);
    const list = guardiansByFamily.get(familyId) ?? [];
    // Two guardian rows can carry the same address — the Perez family has one
    // address on both parents. Deduplicate, or that family is mailed twice.
    if (list.some((g) => g.email === email)) continue;
    list.push({ name: String((row as Record<string, unknown>).full_name ?? ""), email });
    guardiansByFamily.set(familyId, list);
  }

  const meta: WeekMeta = {
    from: `${from}T12:00:00-04:00`,
    to: `${to}T12:00:00-04:00`,
    portalUrl: PORTAL,
    productionUrl: `${PORTAL}/productions/${SWEENEY}`,
  };

  const packets = buildPackets(cast, events, roles);
  mkdirSync(outDir, { recursive: true });

  const manifest = packets.map((packet) => {
    const { subject, html } = renderStudentEmail(packet, meta);
    const slug = packet.legalName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    writeFileSync(join(outDir, `${slug}.html`), html, "utf8");
    return {
      student: packet.legalName,
      greeting: packet.displayName,
      roles: packet.roles,
      calls: packet.calls.length,
      callTitles: packet.calls.map((c) => `${c.startsAt.slice(0, 10)} ${c.title}`),
      subject,
      file: `${slug}.html`,
      to: guardiansByFamily.get(packet.familyId) ?? [],
    };
  });

  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify({ from, to, events: events.length, students: packets.length, manifest }, null, 2),
    "utf8"
  );

  console.log(`week ${from} → ${to}: ${events.length} calls, ${packets.length} students`);
  for (const entry of manifest) {
    const to = entry.to.map((g) => g.email).join(", ") || "!! NO GUARDIAN EMAIL";
    console.log(`  ${entry.student.padEnd(24)} ${String(entry.calls).padStart(2)} calls  ${entry.roles.join(" + ").padEnd(34)} → ${to}`);
  }
  console.log(`\nwritten to ${outDir}/`);
}

main().catch((error) => {
  console.error("FAILED:", error.message ?? error);
  process.exit(1);
});
