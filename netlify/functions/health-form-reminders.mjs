/**
 * Netlify scheduled function: pings the health-form reminder job once a day,
 * mid-morning Eastern. The job itself decides who is actually due (7-day
 * spacing per family) — see src/lib/jobs/health-form-reminders.ts.
 */
const runHealthFormReminders = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/health-form-reminders`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("health-form-reminders:", response.status, await response.text());
};

export default runHealthFormReminders;

export const config = { schedule: "0 15 * * *" };
