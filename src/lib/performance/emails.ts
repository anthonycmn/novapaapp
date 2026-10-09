import "server-only";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { esc, h2, p, button, callout, renderEmailShell, section } from "@/lib/email/template";
import { org } from "@/config/org";
import { STAFF_PORTAL_URL } from "@/config/navigation";
import { ACT_FORMAT_LABELS, ACT_STATUS_LABELS, ACT_TYPE_LABELS, type PerformanceAct, type PerformanceEvent } from "./types";
import { formatEastern, formatRuntime, performerName } from "./rules";

/**
 * The two emails a submission sends, and nothing else.
 *
 * 1. The submitting parent's confirmation. They pressed Submit, so this is
 *    the family's own action answered, not outreach.
 * 2. The event's new-submission alert to its recipient list (default cj@).
 *
 * Neither carries an office copy: adminCopy is for group sends only (CJ,
 * 8 Oct 2026). Staff decisions reach the family as a bell notice written by
 * pe_staff_review(), not by email from here.
 */

function site(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? org.portalUrl;
}

function actLine(act: PerformanceAct): string {
  return [
    act.title ? `"${act.title}"` : "Untitled act",
    act.actType ? ACT_TYPE_LABELS[act.actType] : undefined,
    act.actFormat ? ACT_FORMAT_LABELS[act.actFormat] : undefined,
    act.runtimeSeconds ? formatRuntime(act.runtimeSeconds) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

export async function sendSubmissionEmails(input: {
  event: PerformanceEvent;
  act: PerformanceAct;
  parentEmail?: string;
  parentName?: string;
  familyName: string;
  resubmitted: boolean;
}): Promise<void> {
  const { event, act } = input;
  const url = `${site()}/family/events/${event.id}/act/${act.id}`;
  const names = act.performers.filter((x) => x.inviteStatus !== "declined").map(performerName).join(", ");
  const pending = act.performers.filter((x) => x.inviteStatus === "pending").length;
  const statusLabel = ACT_STATUS_LABELS[act.status];
  const sends: Promise<unknown>[] = [];

  if (input.parentEmail) {
    const decided =
      act.status === "accepted"
        ? "Your act is in the show."
        : act.status === "waitlisted"
          ? "The lineup is full, so your act is on the waitlist. We will let you know if a place opens."
          : "CJ reviews every act. You will hear back in the Parent Portal.";
    const text = [
      `Hello${input.parentName ? ` ${input.parentName.split(" ")[0]}` : ""},`,
      ``,
      `${input.resubmitted ? "We have your changes for" : "We have your sign-up for"} ${event.title}.`,
      ``,
      `Act: ${actLine(act)}`,
      `Performers: ${names}`,
      pending ? `Still waiting on ${pending} invited performer${pending === 1 ? "" : "s"} to confirm.` : "",
      `Status: ${statusLabel}`,
      ``,
      decided,
      event.signupClosesAt ? `You can change or withdraw the act until ${formatEastern(event.signupClosesAt)}.` : "",
      ``,
      `See it in the Parent Portal: ${url}`,
      ``,
      `${org.shortName}`,
    ]
      .filter((line, i, all) => line !== "" || all[i - 1] !== "")
      .join("\n");
    const html = renderEmailShell({
      preheader: `${input.resubmitted ? "Changes received" : "Signed up"}: ${event.title}`,
      content: section(
        [
          h2(input.resubmitted ? "We have your changes" : "You're signed up"),
          p(`${input.resubmitted ? "Your changes for" : "Your sign-up for"} <strong>${esc(event.title)}</strong> came through.`),
          callout(
            [
              `<strong>${esc(actLine(act))}</strong>`,
              `Performers: ${esc(names)}`,
              pending ? `Still waiting on ${pending} invited performer${pending === 1 ? "" : "s"} to confirm.` : "",
              `Status: ${esc(statusLabel)}`,
            ]
              .filter(Boolean)
              .join("<br>")
          ),
          p(esc(decided)),
          event.signupClosesAt
            ? p(`You can change or withdraw the act until ${esc(formatEastern(event.signupClosesAt))}.`)
            : "",
          button("Open in the Parent Portal", url),
        ].join(""),
        { first: true }
      ),
    });
    sends.push(
      getEmailDeliveryProvider().send({
        to: input.parentEmail,
        subject: `${input.resubmitted ? "Changes received" : "Signed up"}: ${event.title}`,
        text,
        html,
        category: "performance-signup",
        audit: { kind: "performance-signup" },
      })
    );
  }

  // The staff portal's real address, from the one place the hub keeps it.
  const staffUrl = `${STAFF_PORTAL_URL}/events/${event.id}`;
  for (const to of event.alertRecipients) {
    const text = [
      `${input.resubmitted ? "Changes submitted" : "New act"} for ${event.title}`,
      ``,
      `Family: ${input.familyName}`,
      `Act: ${actLine(act)}`,
      `Performers: ${names}`,
      pending ? `Invites not yet confirmed: ${pending}` : "",
      `Status: ${statusLabel}`,
      ``,
      `Review it in the staff portal: ${staffUrl}`,
    ]
      .filter(Boolean)
      .join("\n");
    sends.push(
      getEmailDeliveryProvider().send({
        to,
        subject: `[Events] ${input.resubmitted ? "Changes" : "New act"}: ${act.title ?? "Untitled"} (${event.title})`,
        text,
        html: renderEmailShell({
          preheader: `${act.title ?? "New act"} for ${event.title}`,
          content: section(
            [
              h2(`${input.resubmitted ? "Changes submitted" : "New act"} for ${esc(event.title)}`),
              p(`Family: ${esc(input.familyName)}`),
              callout([`<strong>${esc(actLine(act))}</strong>`, `Performers: ${esc(names)}`, pending ? `Invites not yet confirmed: ${pending}` : "", `Status: ${esc(statusLabel)}`].filter(Boolean).join("<br>")),
              button("Review in the staff portal", staffUrl),
            ].join(""),
            { first: true }
          ),
        }),
        category: "performance-alert",
        audit: { kind: "performance-alert" },
      })
    );
  }
  // A failed email never undoes a submission; the act is saved either way.
  const results = await Promise.allSettled(sends);
  for (const r of results) if (r.status === "rejected") console.error("[performance] email failed", r.reason);
}
