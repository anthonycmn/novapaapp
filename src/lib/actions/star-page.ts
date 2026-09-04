"use server";

import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { priceFor } from "@/lib/api/store/catalog";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { notifySubmission, submissionMessage } from "./notify-submission";
import { addCatalogItemAction } from "./store";
import type { FamilyFormState } from "./family";
import type { SubmissionState } from "./spirit-button";
import { isFeatureOpen, FEATURE_COPY } from "@/lib/feature-availability";

/**
 * A family submits a star page for the playbill.
 *
 * The message is forwarded byte-for-byte. Tony, 17 Aug 2026: "The text will be
 * submitted as written." No trimming of line breaks, no smart quotes, no
 * capitalisation fixes — whoever lays out the playbill sees exactly what the
 * parent typed, because a tribute is theirs and not ours to edit.
 *
 * Like spirit buttons, this stores first and notifies second, and takes no
 * payment.
 */
export async function submitStarPageAction(
  productionTitle: string,
  prev: FamilyFormState,
  formData: FormData
): Promise<SubmissionState> {
  /* Closed to families for now — same switch, same reason as spirit buttons. */
  if (!isFeatureOpen("starPages")) {
    return { ok: false, errors: { _form: FEATURE_COPY.starPages.title } };
  }

  const saved = await addCatalogItemAction(prev, formData);
  if (!saved.ok) return saved;

  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const productId = String(formData.get("productId") ?? "");
  const optionValue = String(formData.get("optionValue") ?? "");
  const studentName = String(formData.get("studentName") ?? "").trim();
  const signature = String(formData.get("signature") ?? "").trim();
  // Read raw, NOT trimmed: the parent's own spacing is part of the tribute.
  const message = String(formData.get("message") ?? "");

  const product = (await getProvider().getProducts()).find((p) => p.id === productId);
  const option = product?.options.find((o) => o.value === optionValue);
  const priceCents = product ? priceFor(product, optionValue) : 0;

  const outcome = await notifySubmission({
    subject: `Star page — ${studentName} (${productionTitle})`,
    category: "star_page_submission",
    lines: [
      `${option?.label ?? "Star page"} for ${studentName}`,
      "",
      `Show:      ${productionTitle}`,
      `Performer: ${studentName}`,
      `Size:      ${option?.label ?? optionValue}`,
      `Price:     ${formatCents(priceCents)}`,
      `Photo:     ${formData.get("photoDataUrl") ? "attached to the design in the portal" : "none"}`,
      "",
      "----- MESSAGE, EXACTLY AS THE FAMILY WROTE IT -----",
      message,
      "----- END OF MESSAGE -----",
      "",
      signature ? `Signed: ${signature}` : "No signature given",
      "",
      `Submitted by ${user.displayName}${user.family ? ` (${user.family.name})` : ""}`,
      `Reply to:  ${user.email}`,
      "",
      "Not paid — the store does not take payment yet. The full design, photo",
      `included, is in the family's cart in the ${org.shortName} portal.`,
    ],
  });

  return {
    ok: true,
    message: submissionMessage(outcome, "We'll confirm the total with you."),
  };
}
