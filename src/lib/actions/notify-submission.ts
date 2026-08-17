import "server-only";
import { org } from "@/config/org";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import {
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
}: {
  subject: string;
  lines: string[];
  category: string;
  /**
   * Restrict to a subset by mailbox. An arrival at the kerb goes to two people,
   * not five — copying everyone makes the alert worthless to whoever has to
   * walk to the door.
   */
  only?: readonly string[];
}): Promise<{ delivered: number; total: number }> {
  const all = await resolveSubmissionRecipients();
  const recipients: ResolvedRecipient[] = only
    ? all.filter((recipient) => only.includes(recipient.email))
    : all;
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
