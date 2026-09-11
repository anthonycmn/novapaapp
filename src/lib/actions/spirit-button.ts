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
 * The design goes into the family's cart and, as of 11 Sep 2026 (CJ: "make
 * sure spirit buttons sales work now"), the cart CHECKS OUT for real — the
 * 16 Aug "don't allow them to purchase quite yet" hold is lifted. The front
 * office is still told a design exists, so a cart that never checks out can
 * be chased; payment itself lands through checkoutAction and the Stripe
 * webhook like every other order.
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
      "Not paid yet — the design is in the family's cart, and they were sent",
      `to checkout. The order shows in the ${org.shortName} portal once Stripe`,
      "confirms the payment; if no order follows, this is a cart to chase.",
    ],
  });

  return {
    ok: true,
    message: submissionMessage(
      outcome,
      "Check out when you're ready — nothing is charged until then."
    ),
  };
}
