/**
 * Netlify scheduled function: pings the reminder job every hour. The job
 * itself decides who is actually due (12-hour spacing per family).
 */
const runCastingReminders = async () => {
  const base = process.env.URL ?? "https://novapa-family-hub.netlify.app";
  const response = await fetch(`${base}/api/jobs/casting-reminders`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("casting-reminders:", response.status, await response.text());
};

export default runCastingReminders;

export const config = { schedule: "@hourly" };
