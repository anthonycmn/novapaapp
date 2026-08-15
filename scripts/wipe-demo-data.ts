/**
 * Remove the DEMO world from the live family_hub, leaving only real data.
 *
 * Demo is identified by hard anchors, never guessed:
 *   - demo families  = families with NO registration_account_links row
 *     (every real family was imported with a link) — asserted to be ≤5 and
 *     to have only @example.com guardians before anything is deleted
 *   - demo people    = auth users at @example.com (deleted via the auth
 *     admin API; their profiles + notifications cascade)
 *   - demo catalog   = every season except "Broadway Bound 2026–27" and
 *     everything under it (productions, classes, roles, scenes, boards)
 *   - demo staff     = all staff_profiles (no real staff imported yet)
 *   - demo content   = feed posts, email sends, products, button
 *     templates, review windows, lesson slots, invites (all seeded)
 *
 * Never touched: real families/students/profiles/enrollments, the real
 * season + 24 productions, auth users outside @example.com, and the
 * website's public schema (no client for it even exists here).
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/wipe-demo-data.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- ops script; the
   query-builder generics aren't worth threading through a one-off wipe */
import { createClient } from "@supabase/supabase-js";

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

const REAL_SEASON = "Broadway Bound 2026–27";

async function del(table: string, filter: (q: any) => any, label?: string) {
  const { error, count } = await filter(hub.from(table).delete({ count: "exact" }));
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  console.log(`  ${label ?? table}: ${count ?? "?"} deleted`);
}

async function main() {
  /* ── identify + assert ─────────────────────────────────────────────── */
  const { data: links } = await hub
    .from("registration_account_links")
    .select("family_id")
    .range(0, 4999);
  const linked = new Set((links ?? []).map((l) => String(l.family_id)));

  const { data: families } = await hub.from("families").select("id").range(0, 4999);
  const demoFamilyIds = (families ?? []).map((f) => String(f.id)).filter((id) => !linked.has(id));

  if (demoFamilyIds.length === 0 || demoFamilyIds.length > 5) {
    throw new Error(`Refusing: expected 1-5 demo families, found ${demoFamilyIds.length}`);
  }
  const { data: demoGuardians } = await hub
    .from("guardians")
    .select("email")
    .in("family_id", demoFamilyIds);
  for (const g of demoGuardians ?? []) {
    if (!String(g.email).endsWith("@example.com")) {
      throw new Error(`Refusing: demo-family guardian ${g.email} is not @example.com`);
    }
  }
  console.log(`demo families confirmed: ${demoFamilyIds.length}`);

  const { data: seasons } = await hub.from("seasons").select("id, name");
  const realSeason = (seasons ?? []).find((s) => s.name === REAL_SEASON);
  if (!realSeason) throw new Error(`Refusing: real season "${REAL_SEASON}" not found`);
  const demoSeasonIds = (seasons ?? []).filter((s) => s.name !== REAL_SEASON).map((s) => s.id);

  const { data: demoPrograms } = await hub
    .from("programs")
    .select("id")
    .in("season_id", demoSeasonIds);
  const demoProgramIds = (demoPrograms ?? []).map((p) => p.id);
  const { data: demoProductions } = await hub
    .from("productions")
    .select("id, title")
    .in("season_id", demoSeasonIds);
  const demoProductionIds = (demoProductions ?? []).map((p) => p.id);
  console.log(
    `demo catalog: ${demoSeasonIds.length} seasons, ${demoProgramIds.length} programs, ${demoProductionIds.length} productions (${(demoProductions ?? []).map((p) => p.title).join(", ")})`
  );

  /* ── delete, children first ────────────────────────────────────────── */
  console.log("\nWiping demo world…");
  await del("lesson_bookings", (q: any) => q.not("id", "is", null));
  await del("lesson_slots", (q: any) => q.not("id", "is", null));
  await del("review_windows", (q: any) => q.not("id", "is", null)); // reviews cascade
  await del("feed_posts", (q: any) => q.not("id", "is", null)); // questions cascade
  await del("email_sends", (q: any) => q.not("id", "is", null)); // opens/clicks cascade
  await del("event_notices", (q: any) => q.not("event_key", "is", null));
  await del("family_hub_invites", (q: any) => q.not("email", "is", null));
  await del("products", (q: any) => q.not("id", "is", null));
  await del("button_templates", (q: any) => q.not("id", "is", null));

  // Demo families cascade: guardians, students, enrollments, health forms,
  // documents, tokens, pickups, hopes, confirmations, message threads.
  await del("families", (q: any) => q.in("id", demoFamilyIds), "demo families (cascade)");

  // Demo catalog: productions cascade roles/scenes/boards/assignments/events.
  if (demoProductionIds.length > 0)
    await del("productions", (q: any) => q.in("id", demoProductionIds), "demo productions (cascade)");
  await del("classes", (q: any) => q.in("program_id", demoProgramIds), "demo classes");
  if (demoProgramIds.length > 0)
    await del("programs", (q: any) => q.in("id", demoProgramIds), "demo programs");
  if (demoSeasonIds.length > 0)
    await del("seasons", (q: any) => q.in("id", demoSeasonIds), "demo seasons");

  // All staff profiles are demo people (real staff not imported yet).
  await del("staff_profiles", (q: any) => q.not("id", "is", null), "demo staff profiles");

  /* ── demo auth users (@example.com) — profiles cascade ─────────────── */
  const { data: authList, error: listError } = await hub.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`listUsers: ${listError.message}`);
  let deleted = 0;
  for (const user of authList.users) {
    if (user.email?.endsWith("@example.com")) {
      const { error } = await hub.auth.admin.deleteUser(user.id);
      if (error) throw new Error(`deleteUser ${user.email}: ${error.message}`);
      deleted++;
    }
  }
  console.log(`  demo auth accounts: ${deleted} deleted`);

  /* ── verify ────────────────────────────────────────────────────────── */
  const counts: Record<string, number> = {};
  for (const table of ["families", "students", "profiles", "enrollments", "productions", "staff_profiles"]) {
    const { count } = await hub.from(table).select("*", { count: "exact", head: true });
    counts[table] = count ?? -1;
  }
  console.log("\nRemaining:", JSON.stringify(counts));
}

main().catch((e) => {
  console.error("WIPE FAILED:", e.message ?? e);
  process.exit(1);
});
