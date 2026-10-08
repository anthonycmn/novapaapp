"use server";

import { revalidatePath } from "next/cache";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { assertUploadAllowed } from "@/lib/api/storage";
import { priceFor } from "@/lib/api/store/catalog";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
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
 * Like spirit buttons, this stores first and notifies second. ON SALE as of
 * 8 Oct 2026 (CJ: "I want them to be available for purchase"): the page goes
 * into the family's cart, drawn on the show's graphic at print resolution,
 * and is paid through checkoutAction and the Stripe webhook like every other
 * store order.
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
    subject: `Star page - ${studentName} (${productionTitle})`,
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
      "Not paid yet - the page is in the family's cart, and they were sent",
      `to checkout. The order, with the print-ready page, shows in the ${org.shortName}`,
      "portal once Stripe confirms the payment; if no order follows, this is a",
      "cart to chase.",
    ],
  });

  return {
    ok: true,
    message: submissionMessage(
      outcome,
      "Check out when you're ready - nothing is charged until then."
    ),
  };
}

/**
 * The graphic a show's star pages are drawn on: 1600 px is not enough for a
 * 300 DPI full page (1500 × 2400), so the budget is larger than a button
 * background's, and still a single data URI on the product row.
 */
export async function saveStarPageArtworkAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) {
    return { ok: false, errors: { _form: "Admin only" } };
  }

  const productId = String(formData.get("productId") ?? "");
  const artworkDataUrl = String(formData.get("artworkDataUrl") ?? "");
  const remove = formData.get("removeArtwork") === "true";
  if (!productId) return { ok: false, errors: { _form: "Pick a show" } };
  if (!remove && !artworkDataUrl) {
    return { ok: false, errors: { artworkDataUrl: "Upload the graphic first" } };
  }

  if (artworkDataUrl) {
    try {
      assertUploadAllowed("button-photos", artworkDataUrl);
    } catch (error) {
      return {
        ok: false,
        errors: { artworkDataUrl: error instanceof Error ? error.message : "Bad image" },
      };
    }
  }

  try {
    await getProvider().setStarPageArtwork(
      user.id,
      productId,
      remove ? undefined : artworkDataUrl
    );
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  revalidatePath("/admin/store/star-pages");
  revalidatePath("/store/star-pages");
  return { ok: true };
}
