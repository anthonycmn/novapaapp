/**
 * Run the iCal calendar sync once, by hand.
 *
 * The sync itself is not a script any more — it is a scheduled job
 * (netlify/functions/ical-sync.mjs → /api/jobs/ical-sync → syncIcalFeeds),
 * so Tony's edits to the Google calendar reach families within the hour with
 * nobody running anything. Tony, 17 Aug 2026: "so that when I update it
 * automatically updates."
 *
 * This wrapper exists for two cases: seeding the feed the first time without
 * waiting for the top of the hour, and debugging a feed locally. It shares one
 * implementation with the job, so there is no chance of the two drifting.
 *
 * Needs, in the environment (never committed — a Google "private address" ICS
 * URL is a bearer token for that calendar):
 *   SWEENEY_ICS_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/import-sweeney-calendar.ts
 *
 * To undo entirely:
 *   delete from family_hub.calendar_events where external_source = 'sweeney_ics';
 */
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
import { ICAL_FEEDS } from "../src/config/ical-feeds";
import { syncIcalFeeds } from "../src/lib/api/ical-sync";

async function main() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  const unconfigured = ICAL_FEEDS.filter((feed) => !feed.url).map((feed) => feed.key);
  if (unconfigured.length) {
    console.warn(`No URL in the environment for: ${unconfigured.join(", ")}`);
  }

  const { feeds } = await syncIcalFeeds();
  for (const feed of feeds) {
    if (feed.skipped) {
      console.log(`${feed.key}: SKIPPED — ${feed.skipped}`);
      continue;
    }
    console.log(
      `${feed.key}: parsed ${feed.parsed}, inserted ${feed.inserted}, ` +
        `updated ${feed.updated}, removed ${feed.removed}, ` +
        `${feed.withCallTime} with a call time`
    );
  }
}

main().catch((error) => {
  console.error("ICAL SYNC FAILED:", error?.message ?? error);
  process.exit(1);
});
