/**
 * Netlify scheduled function: Encore Points earning (hub 0098). Every hour,
 * at :20 so it never lands on the registration sync's quarter hours.
 *
 * A payment made at 2:05 shows as points by 3:20 at the latest. Before CJ
 * presses Launch in the staff portal the database does nothing but earn for
 * his preview families.
 */
const runEncoreSync = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/encore-sync`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("encore-sync:", response.status, await response.text());
};

export default runEncoreSync;

export const config = { schedule: "20 * * * *" };
