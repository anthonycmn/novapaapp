/**
 * Netlify scheduled function: every six hours, ask the live portal whether a
 * parent can still reset a password and sign in. The deploy hook
 * (netlify/plugins/reset-smoke) asks the same question the minute a build
 * goes live; this is the backstop for the days nothing is deployed, when
 * what changes is Supabase's side — a setting, a template, an outage.
 * See src/lib/jobs/reset-smoke.ts.
 */
const runResetSmoke = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/reset-smoke`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("reset-smoke:", response.status, await response.text());
};

export default runResetSmoke;

export const config = { schedule: "17 */6 * * *" };
