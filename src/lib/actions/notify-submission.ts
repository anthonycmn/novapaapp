import "server-only";
import { org } from "@/config/org";
import { mergeRecipients } from "@/config/submission-recipients";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import {
  resolveAdminRecipients,
  resolveSubmissionRecipients,
  type ResolvedRecipient,
} from "@/lib/api/submission-recipients";

/**
 * Tell the front office a family submitted something.
 *
 * Always called AFTER the submission is safely stored: a mail failure must
 * never lose a parent's work, so this returns how many recipients were reached
 * rather than throwing, and the caller says so honestly instead of claiming
 * everything went out.
 */
export async function notifySubmission({
  subject,
  lines,
  category,
  only,
  includeAdmins = false,
  also = [],
}: {
  subject: string;
  lines: string[];
  category: string;
  /**
   * Restrict to a subset by mailbox. An arrival at the kerb goes to the two
   * people who can walk to the door rather than to everyone who files the
   * paperwork — `only` is what keeps those two lists different.
   */
  only?: readonly string[];
  /**
   * Add whoever currently holds admin or super admin, on top of `only`.
   *
   * Tony, 18 Aug 2026, about pickup and drop-off: "Make sure that … go to
   * admin and super admin." The named list still decides who ANSWERS the door;
   * this makes sure the people accountable for the child also hear about it,
   * and keeps working when the roles change hands.
   */
  includeAdmins?: boolean;
  /**
   * Extra people this particular submission belongs to — the director of the
   * show a child will miss, say. Resolved by the caller, because who that is
   * depends on what was submitted, and merged with the rest by mailbox.
   */
  also?: readonly ResolvedRecipient[];
}): Promise<{ delivered: number; total: number; mailboxes: string[] }> {
  const all = await resolveSubmissionRecipients();
  const chosen: ResolvedRecipient[] = only
    ? all.filter((recipient) => only.includes(recipient.email))
    : all;

  // Union, deduped by mailbox: an admin who is also on the configured list
  // must not be mailed the same alert twice.
  const recipients: ResolvedRecipient[] = mergeRecipients(
    chosen,
    includeAdmins ? await resolveAdminRecipients() : [],
    [...also]
  );
  const email = getEmailDeliveryProvider();
  const text = lines.filter((line) => line !== undefined).join("\n");

  const results = await Promise.all(
    recipients.map((recipient) =>
      email
        .send({ to: recipient.email, subject, text, category })
        .catch(() => ({ id: "", ok: false }))
    )
  );

  return {
    delivered: results.filter((result) => result.ok).length,
    total: recipients.length,
    // Who actually received it. A submission that records this can show staff
    // the gap — "the show's director has no org mailbox" — rather than
    // implying everyone was told.
    mailboxes: recipients
      .filter((_, index) => results[index]?.ok)
      .map((recipient) => recipient.email),
  };
}

/** One line of reassurance that never overstates what happened. */
export function submissionMessage(
  { delivered, total }: { delivered: number; total: number },
  whatNext: string
): string {
  if (total === 0) return `Saved. ${whatNext}`;
  if (delivered === total) return `Sent to the ${org.shortName} team. ${whatNext}`;
  return `Saved, and ${delivered} of ${total} staff were notified — the front office will still see it in the portal. ${whatNext}`;
}
