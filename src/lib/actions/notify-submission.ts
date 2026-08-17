import "server-only";
import { org } from "@/config/org";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { resolveSubmissionRecipients } from "@/lib/api/submission-recipients";

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
}: {
  subject: string;
  lines: string[];
  category: string;
}): Promise<{ delivered: number; total: number }> {
  const recipients = await resolveSubmissionRecipients();
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
