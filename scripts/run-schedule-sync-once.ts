// One-shot local runner for the portal schedule sync; see import-sweeney-calendar.ts.
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
import { syncPortalSchedule } from "../src/lib/api/schedule-sync";

syncPortalSchedule()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error) => {
    console.error("SCHEDULE SYNC FAILED:", error?.message ?? error);
    process.exit(1);
  });
