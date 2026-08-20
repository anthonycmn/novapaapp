/**
 * Netlify scheduled function: pulls each show's iCal feed into family calendar
 * events every hour, so an edit in Google Calendar reaches families without
 * anyone running anything.
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

export const config = { schedule: "@hourly" };
