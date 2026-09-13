import { randomUUID } from "node:crypto";
import { getServiceClient, getWebsiteReadClient } from "../supabase/client";

/**
 * Provision hub records for website families the app has never seen.
 *
 * The sync engine (reconcile.ts) is deliberately read-matching only: an
 * account it cannot match becomes an unmatched_account issue, never a guessed
 * family. That was the right rule when a one-time import had already created
 * every family — but the import ran once (Aug 2026) and new checkouts kept
 * arriving. Each one sat as an issue forever: the parent paid, the child was
 * in no roster, and nothing was ever going to change that without a human
 * re-running a script. (Found 2026-09-04: ten paid Frozen registrations in
 * that state, some families with no hub records at all.)
 *
 * So the scheduled sync now provisions first. This is the import script's
 * logic (scripts/import-real-families.ts) as a library, with one addition:
 *
 * THE CROSS-FAMILY COLLISION GUARD. A website family whose guardian email is
 * new to the hub but whose CHILD's name already exists on some hub student is
 * not created — it is reported. Creating it would duplicate the child (the
 * real case: giuliana's student sits in a family under her mother's email,
 * and her father's checkout arrived under his). Which family such an account
 * belongs to is a human call; the guard turns a silent duplicate into a
 * visible one-line task.
 *
 * Idempotent: linked website families only gain new students, deduped by
 * camper id and then by name within their family; profiles are only attached
 * where an auth account already exists. Never creates or modifies auth users.
 */

type Row = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;
const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") };
};

function familyNameFor(parentName: string | undefined, email: string): string {
  const last = parentName ? splitName(parentName).last : "";
  if (last) return `${last} Family`;
  if (parentName) return `${parentName} Family`;
  return `${email.split("@")[0]} Family`;
}

export interface ProvisionResult {
  familiesCreated: number;
  studentsCreated: number;
  profilesAttached: number;
  linkedToExisting: number;
  /** Website accounts NOT created because a child's name already exists in
   *  another hub family — each needs a human to link or merge. */
  collisions: { email: string; camper: string }[];
}

async function selectAll(
  client: ReturnType<typeof getServiceClient>,
  table: string,
  columns: string
): Promise<Row[]> {
  const all: Row[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < page) return all;
  }
}

export async function provisionNewWebsiteAccounts(): Promise<ProvisionResult> {
  const hub = getServiceClient();
  const website = getWebsiteReadClient();

  const [webFamilies, webCampers, links, guardians, profiles, students] =
    await Promise.all([
      selectAll(website, "families", "id, email, parent_name, is_test"),
      selectAll(website, "campers", "id, family_id, name, birthdate, age"),
      selectAll(hub, "registration_account_links", "family_id, source, external_id"),
      selectAll(hub, "guardians", "family_id, email"),
      selectAll(hub, "profiles", "id, email"),
      selectAll(hub, "students", "id, family_id, first_name, last_name, camper_id"),
    ]);

  const authByEmail = new Map<string, string>();
  for (let pg = 1; ; pg++) {
    const { data, error } = await hub.auth.admin.listUsers({ page: pg, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    for (const user of data.users) {
      if (user.email) authByEmail.set(user.email.toLowerCase(), user.id);
    }
    if (data.users.length < 1000) break;
  }

  // A linked family still gets its NEW campers provisioned. Until Sep 11 2026
  // a linked family was skipped whole, so a sibling added at a later checkout
  // never became a student: Olivia Zapata was bought a Day Camp Pack on Sep 7
  // alongside her already-enrolled sister and existed in no roster.
  const linkedFamilyByExternalId = new Map(
    links
      .filter((l) => l.source === "website")
      .map((l) => [String(l.external_id), String(l.family_id)] as const)
  );
  // One website link per hub family (the table's primary key). Two parents
  // can check out under two emails for one household; the second becomes a
  // guardian on the same family, not a second link row.
  const familiesWithWebsiteLink = new Set(
    links.filter((l) => l.source === "website").map((l) => String(l.family_id))
  );
  const hubFamilyByGuardianEmail = new Map<string, string>();
  for (const g of guardians) {
    const email = str(g.email)?.toLowerCase();
    if (email) hubFamilyByGuardianEmail.set(email, String(g.family_id));
  }
  const profileIds = new Set(profiles.map((p) => String(p.id)));
  const profileEmails = new Set(
    profiles.map((p) => String(p.email).toLowerCase())
  );
  const studentKeysByFamily = new Map<string, Set<string>>();
  const allStudentKeys = new Set<string>();
  // students.camper_id is unique (0059: a student IS the camper). A camper
  // whose id already sits on a hub student is the same child however either
  // side has since been renamed — "Ruthie" on the website, "Ruth" in the hub —
  // and inserting it again fails the whole run on students_camper_id_key,
  // which is what stopped every sync from Sep 13 2026 until this guard.
  const claimedCamperIds = new Set<string>();
  for (const s of students) {
    const key = normalize(`${s.first_name} ${s.last_name}`);
    const set = studentKeysByFamily.get(String(s.family_id)) ?? new Set<string>();
    set.add(key);
    studentKeysByFamily.set(String(s.family_id), set);
    allStudentKeys.add(key);
    const camperId = str(s.camper_id);
    if (camperId) claimedCamperIds.add(camperId);
  }

  const campersByFamily = new Map<string, Row[]>();
  for (const c of webCampers) {
    const fid = str(c.family_id);
    if (!fid) continue;
    campersByFamily.set(fid, [...(campersByFamily.get(fid) ?? []), c]);
  }

  const result: ProvisionResult = {
    familiesCreated: 0,
    studentsCreated: 0,
    profilesAttached: 0,
    linkedToExisting: 0,
    collisions: [],
  };

  const newFamilies: Row[] = [];
  const newGuardians: Row[] = [];
  const newLinks: Row[] = [];
  const newProfiles: Row[] = [];
  const newStudents: Row[] = [];
  const now = new Date();

  for (const wf of webFamilies) {
    const externalId = str(wf.id);
    const email = str(wf.email)?.toLowerCase();
    if (!externalId || !email) continue;
    if (wf.is_test === true) continue;

    const parentName = str(wf.parent_name);
    const campers = campersByFamily.get(externalId) ?? [];
    const alreadyLinked = linkedFamilyByExternalId.get(externalId);
    let familyId: string;
    const matched = alreadyLinked ?? hubFamilyByGuardianEmail.get(email);
    const isNewFamily = !matched;

    if (matched) {
      familyId = matched;
      // Already linked: family, link, guardian and profile all exist and only
      // the students loop below has work to do. Matched by guardian email:
      // the family exists but this website account is new to it.
      if (!alreadyLinked) result.linkedToExisting++;
    } else {
      // The collision guard — see the module comment.
      const collided = campers.find((c) => {
        const name = str(c.name);
        return name && allStudentKeys.has(normalize(name));
      });
      if (collided) {
        result.collisions.push({ email, camper: str(collided.name) ?? "" });
        continue;
      }
      familyId = randomUUID();
      newFamilies.push({ id: familyId, name: familyNameFor(parentName, email) });
      result.familiesCreated++;
    }

    if (!familiesWithWebsiteLink.has(familyId)) {
      newLinks.push({
        family_id: familyId,
        source: "website",
        external_id: externalId,
        external_email: email,
        auto_matched: !isNewFamily,
      });
      familiesWithWebsiteLink.add(familyId);
    }

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
      result.profilesAttached++;
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
    for (const camper of campers) {
      const name = str(camper.name);
      if (!name) continue;
      const camperId = str(camper.id);
      if (camperId && claimedCamperIds.has(camperId)) continue;
      const { first, last } = splitName(name);
      const dedupeKey = normalize(`${first} ${last}`);
      if (existingKeys.has(dedupeKey)) continue;
      existingKeys.add(dedupeKey);
      allStudentKeys.add(dedupeKey);
      if (camperId) claimedCamperIds.add(camperId);

      let dob = str(camper.birthdate);
      if (!dob && typeof camper.age === "number" && Number.isFinite(camper.age)) {
        dob = `${now.getFullYear() - camper.age}-01-01`;
      }
      if (!dob) {
        // Unknown age: default to under-13, the stricter privacy posture.
        dob = `${now.getFullYear() - 12}-01-01`;
      }
      newStudents.push({
        id: randomUUID(),
        family_id: familyId,
        first_name: first,
        // Single-token camper names stay single: a fabricated last name
        // breaks sync matching and reads wrong everywhere.
        last_name: last,
        date_of_birth: dob,
        has_login: false,
        camper_id: camperId ?? null,
      });
      result.studentsCreated++;
    }
    studentKeysByFamily.set(familyId, existingKeys);
  }

  const insertChunked = async (table: string, rows: Row[]) => {
    for (let i = 0; i < rows.length; i += 400) {
      const { error } = await hub.from(table).insert(rows.slice(i, i + 400));
      if (error) throw new Error(`insert ${table}: ${error.message}`);
    }
  };
  await insertChunked("families", newFamilies);
  await insertChunked("registration_account_links", newLinks);
  await insertChunked("profiles", newProfiles);
  await insertChunked("guardians", newGuardians);
  await insertChunked("students", newStudents);

  return result;
}
