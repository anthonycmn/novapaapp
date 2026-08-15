/**
 * A PREVIEW parent login for Tony: "ZZ Preview Family" — obviously fake,
 * sorts last everywhere, deletable in one command (delete the family +
 * the auth user; everything else cascades).
 *
 *   email    family-preview@novapa.org
 *   password PreviewFamily2026!
 *
 * The kid is enrolled (source "manual") in one real production so the
 * schedule/casting surfaces have content. Staff will see "ZZ Demokid"
 * on that show's roster until the preview family is removed.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/create-preview-family.ts
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

const EMAIL = "family-preview@novapa.org";
const PASSWORD = "PreviewFamily2026!";
const FAMILY_NAME = "ZZ Preview Family";
const SHOW_TITLE = "Charlie and the Chocolate Factory (tech)";

async function main() {
  // Idempotent: clear any earlier preview world first.
  const { data: users } = await hub.auth.admin.listUsers({ perPage: 1000 });
  for (const user of users?.users ?? []) {
    if (user.email === EMAIL) await hub.auth.admin.deleteUser(user.id);
  }
  await hub.from("families").delete().eq("name", FAMILY_NAME);

  const familyId = randomUUID();
  const { error: fErr } = await hub.from("families").insert({
    id: familyId,
    name: FAMILY_NAME,
    city: "Ashburn",
    staff_notes: "Preview fixture for Tony — not a real family. Safe to delete.",
  });
  if (fErr) throw new Error(fErr.message);

  const { data: authUser, error: aErr } = await hub.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Preview Parent" },
  });
  if (aErr) throw new Error(aErr.message);

  const { error: pErr } = await hub.from("profiles").insert({
    id: authUser.user.id,
    email: EMAIL,
    display_name: "Preview Parent",
    role: "parent",
    family_id: familyId,
  });
  if (pErr) throw new Error(pErr.message);

  const { error: gErr } = await hub.from("guardians").insert({
    id: randomUUID(),
    family_id: familyId,
    user_id: authUser.user.id,
    full_name: "Preview Parent",
    email: EMAIL,
    is_primary: true,
    relationship: "Parent/Guardian",
  });
  if (gErr) throw new Error(gErr.message);

  const kidId = randomUUID();
  const { error: sErr } = await hub.from("students").insert([
    {
      id: kidId,
      family_id: familyId,
      first_name: "ZZ",
      last_name: "Demokid",
      date_of_birth: "2015-03-01",
      grade: "4",
    },
    {
      id: randomUUID(),
      family_id: familyId,
      first_name: "ZZ",
      last_name: "Demoteen",
      date_of_birth: "2011-06-01",
      grade: "8",
    },
  ]);
  if (sErr) throw new Error(sErr.message);

  const { data: show, error: shErr } = await hub
    .from("productions").select("id").eq("title", SHOW_TITLE).single();
  if (shErr) throw new Error(shErr.message);
  const { error: eErr } = await hub.from("enrollments").insert({
    id: randomUUID(),
    student_id: kidId,
    production_id: show.id,
    status: "enrolled",
    source: "manual",
  });
  if (eErr) throw new Error(eErr.message);

  console.log(`Preview family ready.\n  ${EMAIL} / ${PASSWORD}\n  Kid "ZZ Demokid" enrolled in ${SHOW_TITLE}`);
}

main().catch((e) => {
  console.error("PREVIEW FAMILY FAILED:", e.message ?? e);
  process.exit(1);
});
