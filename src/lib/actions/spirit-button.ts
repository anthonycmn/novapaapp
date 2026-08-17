"use server";

import { org } from "@/config/org";
import { SUBMISSION_RECIPIENTS } from "@/config/submission-recipients";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { SPIRIT_BUTTON_PRICE_CENTS } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { addToCartAction } from "./store";
import type { FamilyFormState } from "./family";

/** The shared form state plus a line of reassurance to show on success. */
export type SubmissionState = FamilyFormState & { message?: string };

/**
 * A family submits a spirit button design.
 *
 * Deliberately NOT a purchase. Tony, 16 Aug 2026: "Make the star pages and
 * spirit buttons form live - but don't allow them to purchase quite yet." So
 * the design is saved to the family's own cart — which has never taken a
 * payment — and the five staff mailboxes are told there is one waiting.
 *
 * The email is best-effort: a delivery failure must not lose the design, so it
 * is sent after the design is safely stored and its outcome is reported rather
 * than thrown.
 */
export async function submitSpiritButtonAction(
  productionTitle: string,
  prev: FamilyFormState,
  formData: FormData
): Promise<SubmissionState> {
  const saved = await addToCartAction(prev, formData);
  if (!saved.ok) return saved;

  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const studentName = String(formData.get("studentName") ?? "").trim();
  const size = String(formData.get("size") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const role = String(formData.get("role") ?? "").trim();

  const lines = [
    `${quantity} × spirit button for ${studentName}`,
    "",
    `Show:      ${productionTitle}`,
    `Performer: ${studentName}${role ? ` — ${role}` : ""}`,
    `Size:      ${size}"`,
    `Quantity:  ${quantity}`,
    `Price:     ${formatCents(SPIRIT_BUTTON_PRICE_CENTS)} each · ${formatCents(
      SPIRIT_BUTTON_PRICE_CENTS * quantity
    )} total`,
    "",
    `Submitted by ${user.displayName}${user.family ? ` (${user.family.name})` : ""}`,
    user.email ? `Reply to: ${user.email}` : "",
    "",
    "Not paid — the store does not take payment yet. The photo is on the",
    `design in the family's cart in the ${org.shortName} portal.`,
  ].filter(Boolean);

  const email = getEmailDeliveryProvider();
  const results = await Promise.all(
    SUBMISSION_RECIPIENTS.map((recipient) =>
      email
        .send({
          to: recipient.email,
          subject: `Spirit button — ${studentName} (${productionTitle})`,
          text: lines.join("\n"),
          category: "spirit_button_submission",
        })
        .catch(() => ({ id: "", ok: false }))
    )
  );

  const delivered = results.filter((result) => result.ok).length;
  return {
    ok: true,
    message:
      delivered === SUBMISSION_RECIPIENTS.length
        ? `Sent to the ${org.shortName} team. We'll be in touch about payment.`
        : `Design saved. ${delivered} of ${SUBMISSION_RECIPIENTS.length} staff notified — the front office will still see it in the portal.`,
  };
}
