// One-shot local runner for the iCal sync — the same pass the Netlify
// scheduled function makes every 15 minutes, for when you have just changed
// how it reads and want to see the result now rather than at the quarter hour.
//
// Run: npx tsx --env-file=.env.local --tsconfig scripts/tsconfig.json scripts/run-ical-sync-once.ts
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
import { syncIcalFeeds } from "../src/lib/api/ical-sync";

syncIcalFeeds()
  .then((result) => console.log(JSON.stringify(result, null, 2)))
  .catch((error) => {
    console.error("ICAL SYNC FAILED:", error?.message ?? error);
    process.exit(1);
  });
