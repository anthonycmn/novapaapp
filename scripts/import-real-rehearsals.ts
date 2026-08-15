/**
 * Manual trigger for the portal→hub schedule bridge (the same sync that
 * runs hourly in production via netlify/functions/schedule-sync.mjs).
 * Logic lives in src/lib/api/schedule-sync.ts.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/import-real-rehearsals.ts
 */
import { syncPortalSchedule } from "../src/lib/api/schedule-sync";

syncPortalSchedule()
  .then((result) => console.log("schedule sync:", JSON.stringify(result)))
  .catch((error) => {
    console.error("SYNC FAILED:", error.message ?? error);
    process.exit(1);
  });
