/**
 * Netlify scheduled function: pulls each show's iCal feed into family calendar
 * events, so an edit in Google Calendar reaches families without anyone
 * running anything.
 *
 * Every 15 minutes, matching the staff portal's curriculum sync — the two
 * read the same calendars, and running them at the same cadence is what keeps
 * the staff page and the family page from disagreeing for most of an hour
 * after CJ edits an event.
 */
const runIcalSync = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/ical-sync`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("ical-sync:", response.status, await response.text());
};

export default runIcalSync;

export const config = { schedule: "*/15 * * * *" };
