/**
 * Create the REAL show catalog in family_hub from the website's own order
 * history: a "Broadway Bound 2026–27" season + program, and one production
 * per distinct show offering (titles come from the website's activity
 * catalog and regpack product names — nothing invented). Idempotent:
 * existing titles are skipped. Demo seasons lose is_current so the real
 * season drives "current season" features.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/create-real-catalog.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { fetchRealShowOfferings } from "../src/lib/api/registration/website";

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

const SEASON_NAME = "Broadway Bound 2026–27";
const PROGRAM_NAME = "Broadway Bound";

async function main() {
  const offerings = await fetchRealShowOfferings();
  console.log(`${offerings.length} real show offerings:`);
  for (const name of offerings) console.log(`  - ${name}`);

  // Season (idempotent by name).
  const { data: seasons } = await hub.from("seasons").select("id, name, is_current");
  let seasonId = seasons?.find((s) => s.name === SEASON_NAME)?.id as string | undefined;
  if (!seasonId) {
    seasonId = randomUUID();
    const { error } = await hub.from("seasons").insert({
      id: seasonId,
      name: SEASON_NAME,
      starts_on: "2026-06-01",
      ends_on: "2027-08-31",
      is_current: true,
    });
    if (error) throw new Error(`season: ${error.message}`);
    // The real season is current now; demo seasons step aside.
    const others = (seasons ?? []).filter((s) => s.is_current).map((s) => s.id);
    if (others.length > 0) {
      const { error: demoteError } = await hub
        .from("seasons")
        .update({ is_current: false })
        .in("id", others);
      if (demoteError) throw new Error(`demote seasons: ${demoteError.message}`);
    }
    console.log(`season created: ${SEASON_NAME}`);
  }

  const { data: programs } = await hub.from("programs").select("id, name");
  let programId = programs?.find((p) => p.name === PROGRAM_NAME)?.id as string | undefined;
  if (!programId) {
    programId = randomUUID();
    const { error } = await hub.from("programs").insert({
      id: programId,
      season_id: seasonId,
      name: PROGRAM_NAME,
      description: "NOVA PA's Broadway Bound productions (imported from the registration system)",
    });
    if (error) throw new Error(`program: ${error.message}`);
    console.log(`program created: ${PROGRAM_NAME}`);
  }

  const { data: productions } = await hub.from("productions").select("id, title");
  const existing = new Set((productions ?? []).map((p) => String(p.title).trim().toLowerCase()));
  const rows = offerings
    .filter((name) => !existing.has(name.trim().toLowerCase()))
    .map((name) => ({
      id: randomUUID(),
      program_id: programId,
      season_id: seasonId,
      title: name,
    }));
  if (rows.length > 0) {
    const { error } = await hub.from("productions").insert(rows);
    if (error) throw new Error(`productions: ${error.message}`);
  }
  console.log(`productions created: ${rows.length} (already present: ${offerings.length - rows.length})`);
}

main().catch((e) => {
  console.error("CATALOG FAILED:", e.message ?? e);
  process.exit(1);
});
