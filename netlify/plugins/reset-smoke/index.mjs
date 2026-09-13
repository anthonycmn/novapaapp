/**
 * Netlify build plugin: the minute a production deploy is live, ask it
 * whether a parent can reset a password and sign in.
 *
 * onSuccess runs after the deploy is published, so the URL below is serving
 * the build that just finished — the one whose sign-in flow nobody has run
 * against the real Supabase project yet. The job (src/lib/jobs/reset-smoke.ts)
 * does that and emails the office if a step fails. This hook never fails the
 * build: the deploy is already out, and the email is the alarm.
 */
export const onSuccess = async ({ utils }) => {
  if (process.env.CONTEXT !== "production") {
    console.log("reset-smoke: not a production deploy, skipping");
    return;
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    utils.status.show({ title: "reset-smoke skipped", summary: "CRON_SECRET is not in the build environment" });
    return;
  }
  const base = process.env.URL ?? "https://portal.novapa.org";
  try {
    const response = await fetch(`${base}/api/jobs/reset-smoke`, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });
    const body = await response.json().catch(() => ({}));
    const steps = Array.isArray(body.steps)
      ? body.steps.map((s) => `${s.ok ? "PASS" : "FAIL"} ${s.name} — ${s.detail}`).join("\n")
      : JSON.stringify(body);
    utils.status.show({
      title: body.ok ? "Parent sign-in check passed" : "Parent sign-in check FAILED",
      summary: `${response.status} from ${base}/api/jobs/reset-smoke`,
      text: steps,
    });
    console.log("reset-smoke:", response.status, steps);
  } catch (error) {
    utils.status.show({ title: "reset-smoke could not run", summary: String(error) });
    console.error("reset-smoke:", error);
  }
};
