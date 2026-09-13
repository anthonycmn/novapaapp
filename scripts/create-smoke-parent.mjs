/**
 * Create (or repair) the test parent the sign-in check signs in as.
 *
 *   node scripts/create-smoke-parent.mjs
 *
 * portal-test@novapa.org gets the three rows a real login needs — an auth
 * user, a profile, a guardian on its own "Smoke Test Family" — and nothing
 * else: no children, no enrollments, no address, no phone. Re-running repairs
 * whichever row is missing and leaves the rest alone. Sends no email; the
 * auth user is created confirmed, and its password is whatever the last
 * check set (lib/jobs/reset-smoke rotates it every run — nobody keeps it).
 *
 * Reads .env.local for the service key, like issue-login-link.mjs.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const EMAIL = "portal-test@novapa.org";
const FAMILY_NAME = "Smoke Test Family";
const DISPLAY_NAME = "Portal Test Parent";

const hub = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});

const fail = (where, error) => {
  console.error(`${where}: ${error.message ?? error}`);
  process.exit(1);
};

// 1. The auth user. Supabase offers no lookup by email except the list.
let userId = null;
for (let page = 1; page < 50; page += 1) {
  const { data, error } = await hub.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) fail("listUsers", error);
  const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === EMAIL);
  if (hit) {
    userId = hit.id;
    break;
  }
  if (data.users.length < 1000) break;
}
if (userId) {
  console.log(`auth user exists: ${userId}`);
} else {
  const { data, error } = await hub.auth.admin.createUser({
    email: EMAIL,
    password: `Smoke-${randomUUID()}`,
    email_confirm: true,
    user_metadata: { display_name: DISPLAY_NAME },
  });
  if (error) fail("createUser", error);
  userId = data.user.id;
  console.log(`auth user created: ${userId}`);
}

// 2. The family.
let { data: family } = await hub.from("families").select("id").eq("name", FAMILY_NAME).maybeSingle();
if (family) {
  console.log(`family exists: ${family.id}`);
} else {
  const id = randomUUID();
  const { error } = await hub.from("families").insert({
    id,
    name: FAMILY_NAME,
    staff_notes:
      "Not a family. The sign-in check (lib/jobs/reset-smoke) resets this account's " +
      "password and signs in as it after every deploy. Safe to ignore; do not enroll anyone.",
  });
  if (error) fail("families.insert", error);
  family = { id };
  console.log(`family created: ${id}`);
}

// 3. The profile (same id as the auth user).
const { data: profile } = await hub.from("profiles").select("id, family_id").eq("id", userId).maybeSingle();
if (profile) {
  console.log(`profile exists (family ${profile.family_id})`);
} else {
  const { error } = await hub.from("profiles").insert({
    id: userId,
    email: EMAIL,
    display_name: DISPLAY_NAME,
    role: "parent",
    family_id: family.id,
  });
  if (error) fail("profiles.insert", error);
  console.log("profile created");
}

// 4. The guardian, linked to the user.
const { data: guardian } = await hub.from("guardians").select("id, user_id").ilike("email", EMAIL).maybeSingle();
if (guardian) {
  if (guardian.user_id !== userId) {
    const { error } = await hub.from("guardians").update({ user_id: userId }).eq("id", guardian.id);
    if (error) fail("guardians.update", error);
    console.log("guardian re-linked to the auth user");
  } else {
    console.log("guardian exists and is linked");
  }
} else {
  const { error } = await hub.from("guardians").insert({
    id: randomUUID(),
    family_id: family.id,
    user_id: userId,
    full_name: DISPLAY_NAME,
    email: EMAIL,
    is_primary: true,
    relationship: "Test fixture",
  });
  if (error) fail("guardians.insert", error);
  console.log("guardian created");
}

console.log(`\n${EMAIL} can sign in. Run the check: POST /api/jobs/reset-smoke (x-cron-secret).`);
