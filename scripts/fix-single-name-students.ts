/**
 * One-off repair: campers registered with a single-token name ("Theo")
 * were imported as "Theo Theo" (old fallback duplicated the first name),
 * which breaks sync matching and reads wrong. Reset those last names to
 * empty, matching the camper record exactly.
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/fix-single-name-students.ts
 */
import { createClient } from "@supabase/supabase-js";

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

async function main() {
  // Campers whose stored name has no whitespace = genuinely single-token.
  const { data: campers, error } = await website
    .from("campers").select("id, family_id, name").range(0, 4999);
  if (error) throw new Error(error.message);
  const singles = (campers ?? []).filter((c) => !/\s/.test(String(c.name).trim()));
  console.log(`single-token campers: ${singles.length}`);

  const { data: links } = await hub
    .from("registration_account_links")
    .select("family_id, external_id")
    .eq("source", "website")
    .range(0, 4999);
  const hubFamilyByExternal = new Map(
    (links ?? []).map((l) => [String(l.external_id), String(l.family_id)])
  );

  let fixed = 0;
  for (const camper of singles) {
    const first = String(camper.name).trim();
    const hubFamilyId = hubFamilyByExternal.get(String(camper.family_id));
    if (!hubFamilyId) continue;
    const { data: student } = await hub
      .from("students")
      .select("id")
      .eq("family_id", hubFamilyId)
      .eq("first_name", first)
      .eq("last_name", first)
      .maybeSingle();
    if (!student) continue;
    const { error: upErr } = await hub
      .from("students").update({ last_name: "" }).eq("id", student.id);
    if (upErr) throw new Error(upErr.message);
    fixed++;
  }
  console.log(`students fixed: ${fixed}`);
}

main().catch((e) => {
  console.error("FIX FAILED:", e.message ?? e);
  process.exit(1);
});
