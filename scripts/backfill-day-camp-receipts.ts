/**
 * Day camp receipts for novapa.org orders placed before receipts went live
 * (24 Sep 2026, 3:45 PM ET). Dry run by default; --file to file them.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/backfill-day-camp-receipts.ts          # list only
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/backfill-day-camp-receipts.ts --file   # file in the vault
 *
 * Vault only: the website emailed the office and the family when each order
 * was placed. Re-runnable; a receipt already in the vault is skipped.
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";

async function main() {
  const { fileDayCampOrderReceipts } = await import("../src/lib/receipts/registration-orders");
  const run = await fileDayCampOrderReceipts({ since: "2026-01-01T00:00:00Z", dryRun: !process.argv.includes("--file") });
  console.log(JSON.stringify(run, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
