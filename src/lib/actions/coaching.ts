"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  bookCoachingSession,
  cancelCoachingSession,
} from "@/lib/api/coaching/booking";
import {
  completeCoachingPurchase,
  startCoachingPurchase,
} from "@/lib/api/coaching/shop";
import {
  getPaymentProvider,
  livePaymentsBlockedBecause,
} from "@/lib/api/payments";
import { getSessionUser } from "@/lib/auth/session";

export interface CoachingFormState {
  ok: boolean;
  error?: string;
  /** The family has no sessions left — the page offers to buy more. */
  needsSessions?: boolean;
}

/**
 * Booking a coaching session.
 *
 * The family is taken from the SESSION and never from the form. A hidden
 * field naming the family would be a hidden field a browser can edit, and the
 * whole point of `family_book_coaching` taking the family as a parameter is
 * that the caller has already established who it is.
 */
export async function bookCoachingAction(
  _prev: CoachingFormState,
  formData: FormData
): Promise<CoachingFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!user.familyId) {
    return { ok: false, error: "Only a family account can book coaching." };
  }

  const studentId = String(formData.get("studentId") ?? "");
  const coachStaffId = String(formData.get("coachStaffId") ?? "");
  const startsAt = String(formData.get("startsAt") ?? "");
  if (!studentId || !coachStaffId || !startsAt) {
    return { ok: false, error: "Pick a performer and a time." };
  }

  const result = await bookCoachingSession({
    familyId: user.familyId,
    studentId,
    coachStaffId,
    startsAt,
    notes: String(formData.get("notes") ?? ""),
  });

  if (!result.ok) {
    return { ok: false, error: result.error, needsSessions: result.needsSessions };
  }

  revalidatePath("/coaches");
  revalidatePath("/schedule");
  return { ok: true };
}

export async function cancelCoachingAction(
  sessionId: string
): Promise<CoachingFormState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, error: "Not signed in" };

  const result = await cancelCoachingSession(user.familyId, sessionId);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/coaches");
  revalidatePath("/schedule");
  return { ok: true };
}

/**
 * Buying a package of coaching sessions.
 *
 * Deliberately the same shape as the store's `checkoutAction`, including the
 * order of its two guards, because they are guarding the same money:
 *
 *   1. FAIL CLOSED FIRST. A half-configured Stripe — secret key set, webhook
 *      secret not — charges a family and never hears back, so the balance
 *      never appears and nothing in the app says why. That window is real and
 *      invisible; you pass through it during setup. Refusing to sell is the
 *      failure you can apologise for.
 *   2. RESERVE BEFORE REDIRECTING, so the payment reference always has a home
 *      to come back to.
 *
 * The form carries a menu id and a student, never a price. What the package
 * costs is read from the menu inside the database (portal 0154), so the
 * amount sent to Stripe cannot be chosen by the browser.
 */
export async function buyCoachingAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user?.familyId) redirect("/login");

  const menuId = String(formData.get("menuId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!menuId || !studentId) {
    redirect("/coaches?error=" + encodeURIComponent("Pick a performer and a package."));
  }

  const blocked = livePaymentsBlockedBecause();
  if (blocked) redirect(`/coaches?error=${encodeURIComponent(blocked)}`);

  /*
   * COACHING WILL NOT SELL THROUGH THE MOCK PROCESSOR, and this is the one
   * place it deliberately differs from the spirit-button store.
   *
   * With no Stripe key the mock adapter reports the checkout "simulated" and
   * the caller credits the purchase immediately. For a button that is a
   * harmless demo. For coaching it mints a REAL balance — bookable hours of a
   * coach's time, at $120 a session, which somebody then has to teach for
   * free. The store can afford that trade; this cannot.
   *
   * `portal_buyable` defaulting false (portal 0154) is the first lock. This
   * is the second, because the two failures compose: switching packages on
   * before the keys are set is exactly the ordinary sequence somebody would
   * follow.
   */
  if (!getPaymentProvider().isConfigured()) {
    redirect(
      "/coaches?error=" +
        encodeURIComponent(
          "Card payments aren't switched on yet, so coaching can't be bought here. Please message the office."
        )
    );
  }

  let purchase;
  try {
    purchase = await startCoachingPurchase(user.familyId, studentId, menuId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    redirect(`/coaches?error=${encodeURIComponent(message)}`);
  }

  const headerList = await headers();
  const origin =
    headerList.get("origin") ??
    `https://${headerList.get("host") ?? "localhost:3000"}`;

  const checkout = await getPaymentProvider().createCheckout({
    orderReference: purchase.reference,
    customerEmail: user.email,
    lines: [
      {
        name: purchase.service,
        description: `${purchase.sessions} coaching session${
          purchase.sessions === 1 ? "" : "s"
        } for ${purchase.studentName}`,
        unitAmountCents: purchase.amountCents,
        quantity: 1,
      },
    ],
    successUrl: `${origin}/coaches?bought=${purchase.reference}`,
    cancelUrl: `${origin}/coaches`,
  });

  // With the mock processor no real money moves, so the balance is credited
  // here. A real Stripe purchase is credited by the webhook instead, once
  // Stripe says the payment actually succeeded.
  if (checkout.simulated) {
    await completeCoachingPurchase(purchase.reference, checkout.paymentRef);
  }

  redirect(checkout.url);
}
