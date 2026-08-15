/**
 * Netlify scheduled function: pulls the staff portal's season plan into
 * family calendar events every hour. Portal edits (Teen Conservatory
 * schedule, curriculum links, camp weeks) reach families within the hour.
 */
const runScheduleSync = async () => {
  const base = process.env.URL ?? "https://novapa-family-hub.netlify.app";
  const response = await fetch(`${base}/api/jobs/schedule-sync`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("schedule-sync:", response.status, await response.text());
};

export default runScheduleSync;

export const config = { schedule: "@hourly" };
