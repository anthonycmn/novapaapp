import "server-only";
import { org } from "@/config/org";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { auditionReceiptForFamily, type AuditionReceipt } from "./notices";

/**
 * Emailing a family their audition receipt.
 *
 * Same rule as the coaching notifier: this runs AFTER the submission is saved,
 * and a saved submission with a failed email is still a saved submission. So
 * it never throws — a Resend outage comes back as `false` and the family
 * still lands on the page that shows them their code, which is the thing that
 * matters. The code is in the database either way.
 */
export async function sendAuditionReceipt(
  to: string,
  receipt: AuditionReceipt
): Promise<boolean> {
  if (!to) return false;
  const message = auditionReceiptForFamily(receipt);
  try {
    const outcome = await getEmailDeliveryProvider().send({
      to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      category: "auditions",
      replyTo: org.supportEmail,
    });
    return outcome.ok;
  } catch (error) {
    console.error("audition receipt email failed", error);
    return false;
  }
}

export function auditionUrl(productionId: string, studentId: string): string {
  const base = process.env.URL ?? org.portalUrl;
  return `${base}/auditions/${productionId}/${studentId}`;
}
