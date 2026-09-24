/**
 * Rename families whose name is the front of an email address ("cbay99
 * Family") to a real one, by the shared rule in family-name.ts. CJ, 24 Sep
 * 2026: "rename the email-named families to their real names."
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/rename-email-named-families.ts           # dry run
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/rename-email-named-families.ts --apply   # rename
 *
 * A family with no real name anywhere on file keeps its name and is listed.
 * Writes scripts/out/family-renames.tsv (old name, new name, id) either way.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";

import { isEmailDerivedName, realFamilyName } from "../src/lib/api/registration/family-name";
import { getServiceClient, getWebsiteReadClient } from "../src/lib/api/supabase/client";

type Row = Record<string, unknown>;
const APPLY = process.argv.includes("--apply");

async function all(client: ReturnType<typeof getServiceClient>, table: string, columns: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

function group(rows: Row[], key: string): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    const k = String(r[key] ?? "");
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return map;
}

async function main() {
  const hub = getServiceClient();
  const web = getWebsiteReadClient();
  const [families, guardians, profiles, students, links, webFamilies, campers] = await Promise.all([
    all(hub, "families", "id, name"),
    all(hub, "guardians", "family_id, full_name, email, is_primary"),
    all(hub, "profiles", "family_id, display_name, email, role"),
    all(hub, "students", "family_id, last_name"),
    all(hub, "registration_account_links", "family_id, external_id"),
    all(web, "families", "id, email, cc_email, parent_name"),
    all(web, "campers", "family_id, name"),
  ]);
  const gBy = group(guardians, "family_id"), pBy = group(profiles, "family_id"), sBy = group(students, "family_id");
  const lBy = group(links, "family_id"), cBy = group(campers, "family_id");
  const webById = new Map(webFamilies.map((w) => [String(w.id), w]));

  const renames: string[][] = [];
  const unresolved: string[][] = [];
  for (const f of families) {
    const id = String(f.id), name = String(f.name ?? "");
    const web = (lBy.get(id) ?? []).map((l) => webById.get(String(l.external_id))).filter((w): w is Row => Boolean(w));
    const emails = [
      ...(gBy.get(id) ?? []).map((g) => String(g.email ?? g.full_name ?? "")),
      ...(pBy.get(id) ?? []).map((p) => String(p.email ?? "")),
      ...web.flatMap((w) => [String(w.email ?? ""), String(w.cc_email ?? "")]),
    ].filter((e) => e.includes("@"));
    if (!isEmailDerivedName(name, emails)) continue;

    const guardiansSorted = [...(gBy.get(id) ?? [])].sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)));
    const next = realFamilyName({
      parentNames: [
        ...web.map((w) => w.parent_name as string | null),
        ...guardiansSorted.map((g) => g.full_name as string | null),
        ...(pBy.get(id) ?? []).filter((p) => p.role === "parent").map((p) => p.display_name as string | null),
      ],
      studentLastNames: (sBy.get(id) ?? []).map((s) => s.last_name as string | null),
      camperNames: web.flatMap((w) => (cBy.get(String(w.id)) ?? []).map((c) => c.name as string | null)),
    });
    if (next && next !== name) renames.push([name, next, id]);
    else unresolved.push([name, id]);
  }

  mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
  writeFileSync(
    new URL("./out/family-renames.tsv", import.meta.url),
    ["old\tnew\tid", ...renames.map((r) => r.join("\t")), "", "## no real name on file", ...unresolved.map((r) => r.join("\t"))].join("\n")
  );

  if (APPLY) {
    let done = 0;
    for (const [, next, id] of renames) {
      const { error } = await hub.from("families").update({ name: next }).eq("id", id);
      if (error) console.error(`${id}: ${error.message}`);
      else done++;
    }
    console.log(`renamed ${done} of ${renames.length}`);
  }
  console.log(`${renames.length} to rename, ${unresolved.length} with no real name on file${APPLY ? "" : " (dry run)"}`);
  for (const r of renames) console.log(`  ${r[0]}  ->  ${r[1]}`);
  console.log("unresolved:", unresolved.map((u) => u[0]).join(", "));
}

main().catch((error) => { console.error(error); process.exit(1); });
