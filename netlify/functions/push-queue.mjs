/**
 * Netlify scheduled function: drains the push outbox.
 *
 * Every 5 minutes, not 15 like email: the inline kicks in the message and
 * feed actions handle the urgent cases instantly, but everything the
 * provider writes deeper down (casting, schedule changes, photos, forms)
 * waits for this tick — and a rehearsal change should beat the drive to
 * rehearsal. It also releases quiet-hours holds promptly once they end.
 */
const runPushQueue = async () => {
  const base = process.env.URL ?? "https://portal.novapa.org";
  const response = await fetch(`${base}/api/jobs/push-queue`, {
    method: "POST",
    headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
  });
  console.log("push-queue:", response.status, await response.text());
};

export default runPushQueue;

export const config = { schedule: "*/5 * * * *" };
