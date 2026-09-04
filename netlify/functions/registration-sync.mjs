/**
 * Netlify scheduled function: keeps the family hub current with the
 * registration system — new checkout, new family, new enrollment, without a
 * human pressing "resync".
 *
 * Before this existed, the sync ran only when somebody remembered to press
 * the button; every gap between button-presses was a stretch of paid
 * registrations invisible to their families.
 *
 * Every 15 minutes, like the email queue: a parent who just paid checks the
 * app within the hour, and should find their child there.
 */
const runRegistrationSync = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/registration-sync`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("registration-sync:", response.status, await response.text());
};

export default runRegistrationSync;

export const config = { schedule: "*/15 * * * *" };
