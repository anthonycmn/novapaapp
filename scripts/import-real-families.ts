/**
 * One-time import: bring the website's REAL families into the family hub.
 *
 * For every non-test family in the website's registration system (public
 * schema, read-only) this creates in family_hub:
 *   - a families row + primary guardian
 *   - a students row per camper (birthdate approximated from age when the
 *     camper record has none; unknown ages default to under-13 — the
 *     privacy-safe direction, since under-13s get no login and stricter
 *     consent handling)
 *   - a registration_account_links row (source "website") so re-runs and
 *     the sync engine recognize the family
 *   - a profiles row attached to the parent's EXISTING auth account when
 *     one exists (they log in with the password they already use on the
 *     website) — never creates or modifies auth users
 *
 * Idempotent: already-linked website families are skipped; students and
 * profiles are only added when missing. Demo data is left untouched.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/import-real-families.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const hub = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});
// READ-ONLY window onto the website's tables. Never write through this.
// (Cast: same client shape, different schema type parameter.)
const website = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: "public" },
}) as typeof hub;

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

async function selectAll(
  client: typeof hub,
  table: string,
  columns: string
): Promise<Row[]> {
  const all: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client.from(table).select(columns).range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < page) return all;
  }
}

async function insertChunked(table: string, rows: Row[], chunk = 400): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await hub.from(table).insert(rows.slice(i, i + chunk));
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") };
};
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function familyNameFor(parentName: string | undefined, email: string): string {
  const last = parentName ? splitName(parentName).last : "";
  if (last) return `${last} Family`;
  if (parentName) return `${parentName} Family`;
  return `${email.split("@")[0]} Family`;
}

async function main() {
  console.log("Reading website registration data (read-only)…");
  const webFamilies = await selectAll(website, "families", "id, email, parent_name, is_test");
  const webCampers = await selectAll(website, "campers", "id, family_id, name, birthdate, age");

  console.log("Reading current family-hub state…");
  const links = await selectAll(hub, "registration_account_links", "family_id, source, external_id");
  const guardians = await selectAll(hub, "guardians", "family_id, email");
  const profiles = await selectAll(hub, "profiles", "id, email");
  const students = await selectAll(hub, "students", "id, family_id, first_name, last_name");

  console.log("Listing auth accounts (existing website logins)…");
  const authByEmail = new Map<string, string>();
  for (let pg = 1; ; pg++) {
    const { data, error } = await hub.auth.admin.listUsers({ page: pg, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data.users) {
      if (user.email) authByEmail.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 1000) break;
  }
  console.log(`  ${authByEmail.size} auth accounts`);

  const linkedExternalIds = new Set(
    links.filter((l) => l.source === "website").map((l) => String(l.external_id))
  );
  const hubFamilyByGuardianEmail = new Map<string, string>();
  for (const g of guardians) {
    const email = str(g.email)?.toLowerCase();
    if (email) hubFamilyByGuardianEmail.set(email, String(g.family_id));
  }
  const profileIds = new Set(profiles.map((p) => String(p.id)));
  const profileEmails = new Set(profiles.map((p) => String(p.email).toLowerCase()));
  const studentKeysByFamily = new Map<string, Set<string>>();
  for (const s of students) {
    const set = studentKeysByFamily.get(String(s.family_id)) ?? new Set<string>();
    set.add(normalize(`${s.first_name} ${s.last_name}`));
    studentKeysByFamily.set(String(s.family_id), set);
  }

  const campersByFamily = new Map<string, Row[]>();
  for (const c of webCampers) {
    const fid = str(c.family_id);
    if (!fid) continue;
    campersByFamily.set(fid, [...(campersByFamily.get(fid) ?? []), c]);
  }

  const newFamilies: Row[] = [];
  const newGuardians: Row[] = [];
  const newLinks: Row[] = [];
  const newProfiles: Row[] = [];
  const newStudents: Row[] = [];
  const now = new Date();
  let skippedTest = 0;
  let linkedToExisting = 0;
  let alreadyLinked = 0;
  let dobFromAge = 0;
  let dobUnknown = 0;
  let familiesNoLogin = 0;

  for (const wf of webFamilies) {
    const externalId = str(wf.id);
    const email = str(wf.email)?.toLowerCase();
    if (!externalId || !email) continue;
    if (wf.is_test === true) {
      skippedTest++;
      continue;
    }
    if (linkedExternalIds.has(externalId)) {
      alreadyLinked++;
      continue;
    }

    const parentName = str(wf.parent_name);
    let familyId = hubFamilyByGuardianEmail.get(email);
    const isNewFamily = !familyId;
    if (!familyId) {
      familyId = randomUUID();
      newFamilies.push({ id: familyId, name: familyNameFor(parentName, email) });
    } else {
      linkedToExisting++;
    }

    newLinks.push({
      family_id: familyId,
      source: "website",
      external_id: externalId,
      external_email: email,
      auto_matched: !isNewFamily,
    });

    // Parent profile on their EXISTING auth account, if they have one.
    const authId = authByEmail.get(email);
    let guardianUserId: string | null = null;
    if (authId && !profileIds.has(authId) && !profileEmails.has(email)) {
      newProfiles.push({
        id: authId,
        email,
        display_name: parentName ?? email,
        role: "parent",
        family_id: familyId,
      });
      profileIds.add(authId);
      profileEmails.add(email);
      guardianUserId = authId;
    } else if (!authId) {
      familiesNoLogin++;
    }

    if (isNewFamily) {
      newGuardians.push({
        id: randomUUID(),
        family_id: familyId,
        user_id: guardianUserId,
        full_name: parentName ?? email,
        email,
        is_primary: true,
        relationship: "Parent/Guardian",
      });
      hubFamilyByGuardianEmail.set(email, familyId);
    }

    const existingKeys = studentKeysByFamily.get(familyId) ?? new Set<string>();
    for (const camper of campersByFamily.get(externalId) ?? []) {
      const name = str(camper.name);
      if (!name) continue;
      const { first, last } = splitName(name);
      const dedupeKey = normalize(`${first} ${last}`);
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);

      let dob = str(camper.birthdate);
      if (!dob && typeof camper.age === "number" && Number.isFinite(camper.age)) {
        dob = `${now.getFullYear() - camper.age}-01-01`;
        dobFromAge++;
      }
      if (!dob) {
        // Unknown age: default to under-13, the stricter privacy posture.
        dob = `${now.getFullYear() - 12}-01-01`;
        dobUnknown++;
      }
      newStudents.push({
        id: randomUUID(),
        family_id: familyId,
        first_name: first,
        last_name: last || first,
        date_of_birth: dob,
        has_login: false,
      });
    }
    studentKeysByFamily.set(familyId, existingKeys);
  }

  console.log("\nPlan:");
  console.log(`  website families seen: ${webFamilies.length} (test skipped: ${skippedTest}, already imported: ${alreadyLinked})`);
  console.log(`  new families: ${newFamilies.length} (+${linkedToExisting} linked to an existing hub family)`);
  console.log(`  new students: ${newStudents.length} (dob from age: ${dobFromAge}, dob unknown → under-13: ${dobUnknown})`);
  console.log(`  parent logins attached: ${newProfiles.length} (families with no auth account yet: ${familiesNoLogin})`);

  console.log("\nImporting…");
  await insertChunked("families", newFamilies);
  console.log(`  families: ${newFamilies.length}`);
  await insertChunked("registration_account_links", newLinks);
  console.log(`  links: ${newLinks.length}`);
  await insertChunked("profiles", newProfiles);
  console.log(`  profiles: ${newProfiles.length}`);
  await insertChunked("guardians", newGuardians);
  console.log(`  guardians: ${newGuardians.length}`);
  await insertChunked("students", newStudents);
  console.log(`  students: ${newStudents.length}`);

  console.log("\nDone. Real families are in the family hub.");
}

main().catch((error) => {
  console.error("IMPORT FAILED:", error.message ?? error);
  process.exit(1);
});
