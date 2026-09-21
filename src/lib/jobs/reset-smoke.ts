import { org } from "@/config/org";
import { getServiceClient } from "@/lib/api/supabase/client";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { sessionCookieName } from "@/lib/auth/session";
import { SMOKE_PARENT_EMAIL } from "./reset-smoke-fixture";

/**
 * Can a parent get in? Asked of the live portal after every deploy.
 *
 * Why, 13 Sep 2026. Three lockouts in one week, three different bugs, one
 * cause: the sign-in flow was rewritten three times and none of the rewrites
 * was ever run against the real Supabase project before families were. Kelly
 * Watson's phone form never saved (8–9 Sep); Frank Watson's link was spent by
 * Outlook before he touched it (11 Sep); and the code box that replaced the
 * link insisted on six digits when Supabase sends eight, so Blair Winter,
 * Gretchen Holmes and Shara Lessley typed fifteen correct codes into a page
 * that never asked Supabase whether they matched (11–13 Sep). The preview
 * server cannot reach Supabase, so the mock mode every one of those shipped
 * from could not have caught any of them. This job can, within a minute of
 * the deploy, and before a family does.
 *
 * What it does, with the real pages and the real auth project, as a parent
 * would — except that no email is sent and no family is touched:
 *
 *   1. Asks Supabase's admin API for a recovery code for the fixture parent
 *      (`portal-test@novapa.org`). generate_link returns the code in the
 *      response and sends nothing. This is the same code the email would carry.
 *   2. Loads the live /forgot-password code page and submits that code with a
 *      fresh password the way a browser with JavaScript off would: a multipart
 *      POST naming the form's server action. The page must answer with the
 *      303 to /login?reset=1 that a parent's browser follows.
 *   3. Loads the live /login page and signs in with the password just chosen.
 *      The page must set the session cookie and send them to /dashboard.
 *   4. Loads /dashboard with that cookie. It must render, not bounce to /login.
 *
 * Any step failing emails the office (RESET_SMOKE_ALERT_TO, default
 * cj@novapa.org) with the step and what came back. Success is silent unless
 * asked for a report. The fixture's password changes every run, which is the
 * point: nobody keeps it, and nobody needs to.
 *
 * The fixture parent is created by scripts/create-smoke-parent.mjs and kept
 * out of the family play-by-play by lib/activity (it is not a family).
 */

export { SMOKE_PARENT_EMAIL };

export interface SmokeStep {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface SmokeResult {
  ok: boolean;
  base: string;
  startedAt: string;
  durationMs: number;
  steps: SmokeStep[];
  alerted: boolean;
}

class StepFailure extends Error {
  constructor(public readonly detail: string) {
    super(detail);
  }
}

/** The hidden field that names a form's server action, for a no-JS submit. */
function actionIdFor(html: string, fieldName: string): string {
  const forms = html.match(/<form[^>]*>[\s\S]*?<\/form>/g) ?? [];
  for (const form of forms) {
    if (!form.includes(`name="${fieldName}"`)) continue;
    const id = form.match(/name="(\$ACTION_ID_[0-9a-f]+)"/)?.[1];
    if (id) return id;
  }
  throw new StepFailure(
    `no form with a "${fieldName}" field carries a $ACTION_ID (${forms.length} forms on the page)`
  );
}

function randomPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "Smoke-";
  for (let i = 0; i < 18; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

async function submit(
  url: string,
  fields: Record<string, string>,
  headers: Record<string, string> = {}
): Promise<Response> {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return fetch(url, { method: "POST", body, headers, redirect: "manual" });
}

function location(response: Response): string {
  return response.headers.get("location") ?? "";
}

export async function runResetSmoke(options: {
  /** The portal to test. Defaults to the deployment's own URL. */
  base?: string;
  /** Email the report even when everything passed. */
  notify?: boolean;
} = {}): Promise<SmokeResult> {
  const base = (options.base ?? process.env.URL ?? "https://portal.novapa.org").replace(/\/$/, "");
  const startedAt = new Date();
  const steps: SmokeStep[] = [];

  const step = async (name: string, run: () => Promise<string>): Promise<void> => {
    const t0 = Date.now();
    try {
      const detail = await run();
      steps.push({ name, ok: true, detail, ms: Date.now() - t0 });
    } catch (error) {
      const detail = error instanceof StepFailure ? error.detail : String(error);
      steps.push({ name, ok: false, detail, ms: Date.now() - t0 });
      throw error;
    }
  };

  const password = randomPassword();
  const email = SMOKE_PARENT_EMAIL;
  const codePage = `${base}/forgot-password?sent=1&email=${encodeURIComponent(email)}`;
  let code = "";
  let sessionCookie = "";

  try {
    await step("recovery code from Supabase (no email sent)", async () => {
      const { data, error } = await getServiceClient().auth.admin.generateLink({
        type: "recovery",
        email,
      });
      if (error) throw new StepFailure(`generateLink: ${error.message}`);
      code = data.properties?.email_otp ?? "";
      if (!/^\d{6,10}$/.test(code)) {
        throw new StepFailure(`email_otp is "${code}" - expected 6–10 digits`);
      }
      return `${code.length}-digit code`;
    });

    await step("the code page accepts that code", async () => {
      const page = await fetch(codePage, { redirect: "manual" });
      if (page.status !== 200) {
        throw new StepFailure(`GET /forgot-password → ${page.status} ${location(page)}`);
      }
      const actionId = actionIdFor(await page.text(), "code");
      const response = await submit(codePage, { [actionId]: "", email, code, password });
      const to = location(response);
      if (response.status !== 303 || !/\/login\?reset=1$/.test(to)) {
        throw new StepFailure(
          `POST code → ${response.status} ${to || "(no Location)"} - expected 303 to /login?reset=1`
        );
      }
      // Next answers a server action's redirect() with a RELATIVE Location
      // (`/login?reset=1`); curl resolves that silently, `new URL(to)` throws.
      return `303 → ${new URL(to, base).pathname}?reset=1`;
    });

    await step("the login page takes the new password", async () => {
      const page = await fetch(`${base}/login`, { redirect: "manual" });
      if (page.status !== 200) {
        throw new StepFailure(`GET /login → ${page.status} ${location(page)}`);
      }
      const actionId = actionIdFor(await page.text(), "password");
      const response = await submit(`${base}/login`, { [actionId]: "", email, password });
      const to = location(response);
      const cookie = response.headers
        .getSetCookie()
        .find((c) => c.startsWith(`${sessionCookieName}=`));
      if (response.status !== 303 || !/\/dashboard$/.test(to)) {
        throw new StepFailure(
          `POST password → ${response.status} ${to || "(no Location)"} - expected 303 to /dashboard`
        );
      }
      if (!cookie) throw new StepFailure(`303 to /dashboard but no ${sessionCookieName} cookie was set`);
      sessionCookie = cookie.split(";")[0];
      return "303 → /dashboard, session cookie set";
    });

    await step("the dashboard renders for that session", async () => {
      const response = await fetch(`${base}/dashboard`, {
        headers: { cookie: sessionCookie },
        redirect: "manual",
      });
      if (response.status !== 200) {
        throw new StepFailure(`GET /dashboard → ${response.status} ${location(response)}`);
      }
      return "200";
    });
  } catch {
    // The failing step is already on the list; nothing else to add.
  }

  const ok = steps.length === 4 && steps.every((s) => s.ok);
  const result: SmokeResult = {
    ok,
    base,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    steps,
    alerted: false,
  };

  if (!ok || options.notify) {
    result.alerted = await sendReport(result);
  }
  return result;
}

async function sendReport(result: SmokeResult): Promise<boolean> {
  const to = process.env.RESET_SMOKE_ALERT_TO ?? "cj@novapa.org";
  const failed = result.steps.find((s) => !s.ok);
  const subject = result.ok
    ? `Parent portal sign-in check passed (${result.base})`
    : `Parent portal sign-in is BROKEN - ${failed?.name ?? "did not start"}`;
  const lines = result.steps.map(
    (s) => `${s.ok ? "PASS" : "FAIL"}  ${s.name} - ${s.detail} (${s.ms} ms)`
  );
  if (result.steps.length < 4) {
    lines.push(`(stopped after ${result.steps.length} of 4 steps)`);
  }
  const text = [
    result.ok
      ? "A test parent asked for a reset code, typed it, chose a password and signed in - every step on the live portal, no email involved."
      : "A test parent could not get through the live portal's reset-and-sign-in flow. A real family hitting this gets locked out. Details:",
    "",
    ...lines,
    "",
    `Portal: ${result.base}`,
    `Run at: ${result.startedAt} (${result.durationMs} ms)`,
    `Fixture: ${SMOKE_PARENT_EMAIL} - its password is rotated every run, nothing to keep.`,
    "",
    "This check runs after every production deploy and every six hours (src/lib/jobs/reset-smoke.ts).",
  ].join("\n");

  const sent = await getEmailDeliveryProvider().send({
    to,
    subject,
    text,
    category: "reset-smoke",
    replyTo: org.supportEmail,
  });
  return sent.ok;
}
