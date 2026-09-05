"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import {
  describeButton,
  getPaymentProvider,
  livePaymentsBlockedBecause,
} from "@/lib/api/payments";
import { isButtonLine, type OrderStatus } from "@/lib/api/types";
import type { Customization } from "@/lib/api/store/catalog";
import { assertUploadAllowed } from "@/lib/api/storage";
import { logActivity } from "@/lib/activity";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { refuseIfImpersonating } from "@/lib/auth/impersonation";
import { assessPhotoQuality } from "@/lib/store-rules";
import type { FamilyFormState } from "./family";
import { isFeatureOpen, FEATURE_COPY } from "@/lib/feature-availability";

const designSchema = z.object({
  photoUrl: z.string().min(1, "Add a photo"),
  /** The press-ready artwork the preview drew. Optional: a browser that
   *  couldn't draw it still gets to order a button. */
  printUrl: z.string().optional(),
  photoWidth: z.number().int().positive(),
  photoHeight: z.number().int().positive(),
  studentName: z.string().min(1, "Enter a name").max(40),
  role: z.string().max(40),
  size: z.enum(["2.25", "3", "3.5"]),
  style: z.enum(["classic", "star", "ribbon"]),
  templateId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
  /** Set when the family accepted a low-resolution warning. */
  acknowledgedLowRes: z.boolean(),
});

export async function addToCartAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  /* This one parses a spirit-button design, so it closes with spirit buttons.
     addCatalogItemAction below is deliberately left open: it also carries
     private lessons, which are still on sale. */
  if (!isFeatureOpen("spiritButtons")) {
    return { ok: false, errors: { _form: FEATURE_COPY.spiritButtons.title } };
  }

  const parsed = designSchema.safeParse({
    photoUrl: String(formData.get("photoUrl") ?? ""),
    printUrl: String(formData.get("printUrl") ?? "") || undefined,
    photoWidth: Number(formData.get("photoWidth") ?? 0),
    photoHeight: Number(formData.get("photoHeight") ?? 0),
    studentName: String(formData.get("studentName") ?? ""),
    role: String(formData.get("role") ?? ""),
    size: formData.get("size"),
    style: formData.get("style"),
    templateId: String(formData.get("templateId") ?? ""),
    quantity: Number(formData.get("quantity") ?? 1),
    acknowledgedLowRes: formData.get("acknowledgedLowRes") === "true",
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const { quantity, acknowledgedLowRes, printUrl, ...design } = parsed.data;

  // Server-side re-check of the low-res guard: the client warns, but the
  // server is what actually refuses, so a bypassed dialog can't sneak a
  // blurry photo into production.
  const quality = assessPhotoQuality(design.photoWidth, design.photoHeight, design.size);
  if (quality.quality === "low" && !acknowledgedLowRes) {
    return { ok: false, errors: { photoUrl: quality.message ?? "Photo resolution too low" } };
  }

  // Both images ride the row as data URIs; the bucket limits (type + size)
  // are re-checked here because the strings came from the client.
  try {
    assertUploadAllowed("button-photos", design.photoUrl);
    if (printUrl) assertUploadAllowed("button-photos", printUrl);
  } catch (error) {
    return {
      ok: false,
      errors: { photoUrl: error instanceof Error ? error.message : "Bad photo" },
    };
  }

  await getProvider().addToCart(
    user.id,
    { ...design, printImageUrl: printUrl },
    quantity
  );
  await logActivity({
    user,
    action: "store.cart_added",
    summary: `Added a spirit button to the cart (${quantity} × ${design.size}", for ${design.studentName})`,
    detail: { style: design.style, templateId: design.templateId },
  });
  revalidatePath("/store/cart");
  return { ok: true };
}

/** Star pages, lessons, and anything else in the catalog (#11). */
export async function addCatalogItemAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const productId = String(formData.get("productId") ?? "");
  const optionValue = String(formData.get("optionValue") ?? "") || undefined;
  const quantity = Number(formData.get("quantity") ?? 1);
  const studentName = String(formData.get("studentName") ?? "").trim();

  if (!studentName) {
    return { ok: false, errors: { studentName: "Whose is this?" } };
  }

  const provider = getProvider();
  const product = (await provider.getProducts()).find((p) => p.id === productId);
  if (!product) return { ok: false, errors: { _form: "That product isn't available" } };

  let customization: Customization;

  if (product.type === "star_page") {
    const message = String(formData.get("message") ?? "").trim();
    const photoDataUrl = String(formData.get("photoDataUrl") ?? "");
    if (!message) return { ok: false, errors: { message: "Add your message" } };
    if (product.requiresPhoto && !photoDataUrl) {
      return { ok: false, errors: { photoDataUrl: "Choose a photo" } };
    }
    if (photoDataUrl) {
      try {
        assertUploadAllowed("button-photos", photoDataUrl);
      } catch (error) {
        return {
          ok: false,
          errors: { photoDataUrl: error instanceof Error ? error.message : "Bad photo" },
        };
      }
    }
    customization = {
      kind: "star_page",
      studentName,
      pageSize: optionValue ?? "",
      photoUrl: photoDataUrl || undefined,
      photoWidth: Number(formData.get("photoWidth") ?? 0) || undefined,
      photoHeight: Number(formData.get("photoHeight") ?? 0) || undefined,
      message,
      signature: String(formData.get("signature") ?? "").trim(),
    };
  } else if (product.type === "private_lesson") {
    customization = {
      kind: "private_lesson",
      studentName,
      packageOption:
        product.options.find((option) => option.value === optionValue)?.label ?? "",
      preferredStaffId: String(formData.get("preferredStaffId") ?? "") || undefined,
      notes: String(formData.get("notes") ?? "").trim(),
    };
  } else {
    customization = { kind: "simple", note: studentName };
  }

  try {
    await provider.addCatalogItemToCart(user.id, {
      productId,
      optionValue,
      quantity,
      customization,
    });
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  await logActivity({
    user,
    action: "store.cart_added",
    summary: `Added to the cart: ${product.name}${optionValue ? ` (${optionValue})` : ""} for ${studentName}`,
    detail: { productId, quantity },
  });
  revalidatePath("/store/cart");
  // Catalog products render on both successor pages.
  revalidatePath("/store");
  revalidatePath("/store/lessons");
  return { ok: true };
}

export async function updateCartItemAction(itemId: string, quantity: number): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().updateCartItem(user.id, itemId, quantity);
  revalidatePath("/store/cart");
}

export async function removeCartItemAction(itemId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().removeCartItem(user.id, itemId);
  revalidatePath("/store/cart");
}

/** Creates the order, then hands off to the payment processor. */
export async function checkoutAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user?.familyId) redirect("/login");

  /* Hub 0063. This spends a family's money on their saved card. Redirected
     rather than silently dropped, because a basket that does not check out and
     does not say why is a basket somebody presses four more times. */
  if (await refuseIfImpersonating("store")) redirect("/store/cart?blocked=impersonation");

  const provider = getProvider();
  const cart = await provider.getCart(user.id);
  if (cart.length === 0) redirect("/store/cart");

  /*
   * Fail closed before an order exists. A half-configured Stripe would charge
   * a family and never mark the order paid — see livePaymentsBlockedBecause.
   */
  const blocked = livePaymentsBlockedBecause();
  if (blocked) redirect(`/store/cart?error=${encodeURIComponent(blocked)}`);

  const payments = getPaymentProvider();
  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  // Reserve the order first so the payment reference always has a home.
  const order = await provider.createOrder(user.id, "pending");

  await logActivity({
    user,
    action: "store.checkout_started",
    summary: `Checked out the cart — order ${order.reference}, ${cart.length} item${
      cart.length === 1 ? "" : "s"
    }`,
    detail: { reference: order.reference },
  });

  const checkout = await payments.createCheckout({
    orderReference: order.reference,
    customerEmail: user.email,
    lines: cart.map((item) => ({
      // Buttons get a descriptive line; catalog products already carry a
      // display name that includes the chosen option.
      name: isButtonLine(item)
        ? describeButton(item.studentName, item.role, item.size)
        : item.displayName,
      unitAmountCents: item.unitPriceCents,
      quantity: item.quantity,
    })),
    successUrl: `${origin}/store/orders?placed=${order.reference}`,
    cancelUrl: `${origin}/store/cart`,
  });

  // With the mock processor no real payment happens, so mark it paid here.
  // Stripe orders are marked paid by the webhook instead.
  if (checkout.simulated) {
    await provider.markOrderPaid(order.reference, checkout.paymentRef);
  }

  redirect(checkout.url);
}

export async function reorderAction(orderId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().reorder(user.id, orderId);
  await logActivity({
    user,
    action: "store.reordered",
    summary: "Re-added a previous order to the cart",
    detail: { orderId },
  });
  revalidatePath("/store/cart");
  redirect("/store/cart");
}

export async function updateOrderStatusAction(
  orderId: string,
  status: OrderStatus,
  formData: FormData
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  const note = String(formData.get("note") ?? "").trim() || undefined;
  await getProvider().updateOrderStatus(user.id, orderId, status, note);
  revalidatePath("/admin/store");
}
