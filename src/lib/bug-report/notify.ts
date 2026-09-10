import "server-only";
import { org } from "@/config/org";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { esc } from "@/lib/email/template";
import { describeEnvironment, type BugEnvironment } from "./environment";

export interface BugReportNotice {
  reporterName: string;
  reporterEmail: string;
  whatHappened: string;
  whatExpected?: string;
  environment: BugEnvironment;
}

/**
 * The subject line, which is the whole email on a phone.
 *
 * The page comes first because it is the thing that decides whether this is
 * urgent — a bug on /login is everybody, a bug on /store/buttons is a Tuesday.
 * Then the reporter's own first words, cut where a sentence ends if one ends
 * near enough, so the subject reads like a sentence rather than a stump.
 */
export function bugReportSubject(notice: BugReportNotice): string {
  const first = notice.whatHappened.trim().split(/\n/)[0] ?? "";
  const cut = first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
  return `Bug on ${notice.environment.page} — ${cut || "no description"}`;
}

/**
 * Deliberately plain.
 *
 * This is the one email in the system nobody needs branding on: it is read
 * once, on a phone, by the person who will go and fix the thing. The
 * environment block is the same text the reporter saw on the form — one
 * rendering, so there is no version of it they never read.
 */
export function bugReportEmail(notice: BugReportNotice): {
  subject: string;
  text: string;
  html: string;
} {
  const lines = [
    notice.whatHappened.trim(),
    "",
    ...(notice.whatExpected?.trim()
      ? ["What they expected instead:", notice.whatExpected.trim(), ""]
      : []),
    `Reported by ${notice.reporterName} (${notice.reporterEmail})`,
    "",
    describeEnvironment(notice.environment),
  ];
  const text = lines.join("\n");
  return {
    subject: bugReportSubject(notice),
    text,
    html: `<pre style="font:14px/1.5 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap">${esc(text)}</pre>`,
  };
}

/**
 * Send it to CJ — CJ, 10 Sep 2026: "cj@ gets the reports only."
 *
 * Never throws, for the same reason the audition receipt never throws: the
 * report is already saved by the time this runs, and a Resend outage must not
 * turn a parent's report into a red box that teaches them not to bother again.
 * The reply-to is the reporter, so answering the mail answers the person.
 */
export async function sendBugReport(notice: BugReportNotice): Promise<boolean> {
  const message = bugReportEmail(notice);
  try {
    const outcome = await getEmailDeliveryProvider().send({
      to: org.bugReportEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
      category: "bug-reports",
      replyTo: notice.reporterEmail || org.supportEmail,
    });
    return outcome.ok;
  } catch (error) {
    console.error("bug report email failed", error);
    return false;
  }
}
