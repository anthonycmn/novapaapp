"use server";

import { org } from "@/config/org";
import { SPIRIT_BUTTON_PRICE_CENTS } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { notifySubmission, submissionMessage } from "./notify-submission";
import { addToCartAction } from "./store";
import type { FamilyFormState } from "./family";
import { isFeatureOpen, FEATURE_COPY } from "@/lib/feature-availability";

/** The shared form state plus a line of reassurance to show on success. */
export type SubmissionState = FamilyFormState & { message?: string };

/**
 * A family submits a spirit button design.
 *
 * Deliberately NOT a purchase. Tony, 16 Aug 2026: "Make the star pages and
 * spirit buttons form live - but don't allow them to purchase quite yet." So
 * the design is saved to the family's own cart — which has never taken a
 * payment — and the front office is told there is one waiting.
 */
export async function submitSpiritButtonAction(
  productionTitle: string,
  prev: FamilyFormState,
  formData: FormData
): Promise<SubmissionState> {
  /* Closed to families for now. Asked before addToCartAction below, so a stale
     tab left open from before the switch cannot put one in a basket. */
  if (!isFeatureOpen("spiritButtons")) {
    return { ok: false, errors: { _form: FEATURE_COPY.spiritButtons.title } };
  }

  const saved = await addToCartAction(prev, formData);
  if (!saved.ok) return saved;

  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const studentName = String(formData.get("studentName") ?? "").trim();
  const size = String(formData.get("size") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const role = String(formData.get("role") ?? "").trim();

  const outcome = await notifySubmission({
    subject: `Spirit button — ${studentName} (${productionTitle})`,
    category: "spirit_button_submission",
    lines: [
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
      `Reply to:  ${user.email}`,
      "",
      "Not paid — the store does not take payment yet. The uploaded photo is on",
      `the design in the family's cart in the ${org.shortName} portal.`,
    ],
  });

  return {
    ok: true,
    message: submissionMessage(outcome, "We'll be in touch about payment."),
  };
}
