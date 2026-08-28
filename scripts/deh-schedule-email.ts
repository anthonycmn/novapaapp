/**
 * Render the Dear Evan Hansen updated-schedule email — one individualized
 * message per student in the company.
 *
 * Run:
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/deh-schedule-email.ts \
 *     --out deh-email-out
 *
 * Writes one .html per student plus manifest.json. It does NOT send and does
 * NOT queue, for the same reason `weekly-company-email.ts` does not: the whole
 * cohort should be readable before anyone decides to mail it.
 *
 * **Where the roster comes from, and why it is not `family_hub`.**
 * The obvious source would be `family_hub.enrollments`, and it is wrong: it
 * holds exactly ONE Dear Evan Hansen row (Jordyn Medina), because the hub only
 * ever adopted enrollments that came through the new registration portal. The
 * other twenty-two families registered through Sawyer and live in
 * `public.legacy_enrollments`. Reading either source alone mails a fraction of
 * the company and, worse, looks complete while doing it. Both are read here
 * and unioned on the student's name.
 *
 * **Where the addresses come from.** A student's household can have an address
 * on the registration record and a different set on their portal guardians —
 * the Burns family registered under one address and has two entirely different
 * ones in the hub. Dropping either risks missing the parent who actually reads
 * mail, so every known address is included, deduplicated case-insensitively.
 * Addresses that look like the student's own are flagged in the manifest
 * rather than silently kept or silently dropped: students have no email column
 * in this schema at all, so anything student-shaped here arrived by a parent
 * typing it into a registration form, and it is a judgment call, not a lookup.
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEH_SCHEDULE,
  renderDehEmail,
  scheduleRange,
  type DehMeta,
  type DehRecipient,
} from "../src/lib/email/deh-schedule";

/** public.activities — "Dear Evan Hansen — Triple Threat Teen Intensive". */
const DEH_ACTIVITY_ID = 1805731;
/** family_hub.productions — the same show, hub-side. */
const DEH_PRODUCTION_ID = "24437b1f-e9a0-43e4-95e3-4febefe79ec0";
const PORTAL = "https://portal.novapa.org";
const VENUE = "Franklin Park Arts Center";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

/** Names collapse to this for matching across the two registration systems. */
/**
 * An embedded PostgREST relation arrives as an object or a one-element array
 * depending on how the FK is declared; the generated types say array. Both
 * shapes mean "the one related row".
 */
function embedded(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row ? (row as Record<string, unknown>) : null;
}

function nameKey(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z]+/g, " ").trim();
}

/** Does this address look like the student's rather than a parent's? */
function looksLikeStudentAddress(email: string, studentName: string): boolean {
  const local = email.split("@")[0].replace(/[^a-z]+/gi, "").toLowerCase();
  const parts = nameKey(studentName).split(" ").filter((p) => p.length > 2);
  return parts.length > 1 && parts.every((part) => local.includes(part));
}

interface Roster {
  studentName: string;
  emails: string[];
  guardianNames: string[];
  sources: string[];
}

async function main() {
  const outDir = arg("out", "deh-email-out");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const client = (schema: string) =>
    createClient(url, key, { db: { schema }, auth: { persistSession: false } });
  const web = client("public");
  const hub = client("family_hub");

  const roster = new Map<string, Roster>();

  const add = (studentName: string, email: string | null, guardian: string | null, source: string) => {
    const name = studentName.replace(/\s+/g, " ").trim();
    if (!name) return;
    const key = nameKey(name);
    const entry = roster.get(key) ?? { studentName: name, emails: [], guardianNames: [], sources: [] };
    const address = (email ?? "").trim().toLowerCase();
    if (address && !entry.emails.includes(address)) entry.emails.push(address);
    const who = (guardian ?? "").trim();
    // Some guardian rows carry the address in the name column; that is not a name.
    if (who && !who.includes("@") && !entry.guardianNames.includes(who)) entry.guardianNames.push(who);
    if (!entry.sources.includes(source)) entry.sources.push(source);
    roster.set(key, entry);
  };

  /* Sawyer-era registrations — the bulk of the company. */
  const { data: legacy, error: legacyError } = await web
    .from("legacy_enrollments")
    .select("email, camper_name")
    .eq("activity_id", DEH_ACTIVITY_ID);
  if (legacyError) throw new Error(`legacy_enrollments: ${legacyError.message}`);
  for (const row of legacy ?? []) {
    add(String(row.camper_name ?? ""), String(row.email ?? ""), null, "legacy_enrollments");
  }

  /* Registrations that came through the new checkout. */
  const { data: items, error: itemsError } = await web
    .from("order_items")
    .select("camper_name, orders(email, parent_name)")
    .eq("activity_id", DEH_ACTIVITY_ID);
  if (itemsError) throw new Error(`order_items: ${itemsError.message}`);
  for (const row of items ?? []) {
    const order = embedded(row.orders);
    add(
      String(row.camper_name ?? ""),
      order ? String(order.email ?? "") : null,
      order ? String(order.parent_name ?? "") : null,
      "order_items"
    );
  }

  /* Anyone the hub already knows is enrolled — one row today, but the
     registration bridge adopts more over time and this must not go stale. */
  const { data: enrolled, error: enrolledError } = await hub
    .from("enrollments")
    .select("students(first_name, last_name)")
    .eq("production_id", DEH_PRODUCTION_ID);
  if (enrolledError) throw new Error(`enrollments: ${enrolledError.message}`);
  for (const row of enrolled ?? []) {
    const student = embedded(row.students);
    if (!student) continue;
    add(`${student.first_name ?? ""} ${student.last_name ?? ""}`, null, null, "hub_enrollment");
  }

  /* Portal guardians for everyone matched by name. Their addresses are added
     to — never substituted for — the registration address. */
  const { data: students, error: studentsError } = await hub
    .from("students")
    .select("first_name, last_name, family_id");
  if (studentsError) throw new Error(`students: ${studentsError.message}`);

  const { data: guardians, error: guardiansError } = await hub
    .from("guardians")
    .select("family_id, full_name, email");
  if (guardiansError) throw new Error(`guardians: ${guardiansError.message}`);
  const guardiansByFamily = new Map<string, Record<string, unknown>[]>();
  for (const guardian of guardians ?? []) {
    const familyId = String(guardian.family_id);
    const list = guardiansByFamily.get(familyId) ?? [];
    list.push(guardian as Record<string, unknown>);
    guardiansByFamily.set(familyId, list);
  }

  for (const row of students ?? []) {
    const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`;
    if (!roster.has(nameKey(name))) continue;
    for (const guardian of guardiansByFamily.get(String(row.family_id)) ?? []) {
      add(name, String(guardian.email ?? ""), String(guardian.full_name ?? ""), "hub_guardian");
    }
  }

  const meta: DehMeta = { portalUrl: PORTAL, venue: VENUE };
  mkdirSync(outDir, { recursive: true });

  const entries = [...roster.values()].sort((a, b) =>
    a.studentName.localeCompare(b.studentName)
  );

  const manifest = entries.map((entry) => {
    const recipient: DehRecipient = {
      studentName: entry.studentName,
      to: entry.emails,
      guardianNames: entry.guardianNames,
    };
    const { subject, html } = renderDehEmail(recipient, meta);
    const slug = entry.studentName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    writeFileSync(join(outDir, `${slug}.html`), html, "utf8");
    return {
      student: entry.studentName,
      to: entry.emails,
      guardians: entry.guardianNames,
      sources: entry.sources,
      looksLikeStudentAddress: entry.emails.filter((e) =>
        looksLikeStudentAddress(e, entry.studentName)
      ),
      subject,
      file: `${slug}.html`,
    };
  });

  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify(
      { production: "Dear Evan Hansen", range: scheduleRange(), days: DEH_SCHEDULE, students: manifest.length, manifest },
      null,
      2
    ),
    "utf8"
  );

  console.log(`Dear Evan Hansen — ${scheduleRange()}: ${manifest.length} students`);
  for (const entry of manifest) {
    const to = entry.to.join(", ") || "!! NO ADDRESS";
    const flag = entry.looksLikeStudentAddress.length ? "  [student-looking address]" : "";
    console.log(`  ${entry.student.padEnd(26)} → ${to}${flag}`);
  }
  const missing = manifest.filter((e) => e.to.length === 0);
  if (missing.length) console.log(`\n!! ${missing.length} with no address at all`);
  console.log(`\nwritten to ${outDir}/`);
}

main().catch((error) => {
  console.error("FAILED:", error.message ?? error);
  process.exit(1);
});
