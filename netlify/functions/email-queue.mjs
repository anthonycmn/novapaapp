/**
 * Netlify scheduled function: delivers scheduled email whose time has come.
 *
 * Before this existed, `email_sends.scheduled_for` was written and never read
 * — the composer's Schedule field produced a row nothing would ever send.
 *
 * Every 15 minutes, not hourly: these carry rehearsal call times, and a 9:00
 * AM send arriving at 9:59 is a different message to a parent deciding
 * whether to leave the house.
 */
const runEmailQueue = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/email-queue`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("email-queue:", response.status, await response.text());
};

export default runEmailQueue;

export const config = { schedule: "*/15 * * * *" };
