/**
 * File Family Vault receipts for portal sales made before 24 Sep 2026, when
 * src/lib/receipts went live. CJ, 24 Sep 2026: "yes, backfill the three
 * receipts" — NPA-1045, NPA-1046, COACH-12.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/backfill-purchase-receipts.ts
 *
 * Vault only: no email to the family, CJ or Todd (notify: false). Re-runnable;
 * a receipt already in the vault is skipped.
 */
import { readFileSync } from "node:fs";
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";

const STORE = ["NPA-1045", "NPA-1046"];
const COACHING = ["COACH-12"];

async function main() {
  const { getProvider } = await import("../src/lib/api");
  const { jobActorId } = await import("../src/lib/jobs/actor");
  const { recordStoreOrderPaid, recordCoachingPurchasePaid } = await import("../src/lib/receipts/record");

  const actor = await jobActorId();
  if (!actor) throw new Error("No job actor");
  const orders = await getProvider().getAllOrders(actor);

  for (const reference of STORE) {
    const order = orders.find((o) => o.reference === reference);
    if (!order?.paidAt) { console.log(`${reference}: not found or unpaid, skipped`); continue; }
    console.log(reference, await recordStoreOrderPaid(order, { notify: false }));
  }
  for (const reference of COACHING) {
    console.log(reference, await recordCoachingPurchasePaid(reference, { notify: false }));
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
