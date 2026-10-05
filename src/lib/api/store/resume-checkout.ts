import type { CartItem } from "@/lib/api/types";

/**
 * Put a family's basket back after they back out of Stripe.
 *
 * Found 5 Oct 2026 checking CJ's "ensure that you can pay for spirit buttons
 * and money is processed": checkout reserves the order and EMPTIES the cart
 * before the family ever reaches Stripe (so the payment reference always has
 * a home). Pressing Back or "cancel" on the Stripe page then landed them on
 * an empty cart. On 18 Sep one family designed Lorelai's button three times
 * in five minutes - NPA-1043 and NPA-1044 abandoned, NPA-1045 paid - and
 * NPA-1047/1048 were left the same way, each an unpaid "new" order sitting
 * in the staff queue with the design the family had to rebuild.
 *
 * Stripe's cancel_url now carries the order reference. When the family lands
 * back on the cart with that reference, the cart is empty, and the order is
 * theirs and still UNPAID, its lines go back in the cart exactly as they
 * were - print file included - so pressing Checkout again just works. A paid
 * order is never copied (that would be a second set of buttons), and a cart
 * that already holds something is left alone, which is also what keeps a
 * page refresh from adding the lines twice.
 *
 * The abandoned order itself is left as it is: the webhook can still mark it
 * paid if Stripe completes the old session, and the staff desk counts only
 * PAID orders as work to make.
 */
export interface ResumeCheckoutProvider {
  getCart(actorId: string): Promise<CartItem[]>;
  getOrdersForFamily(
    actorId: string,
    familyId: string
  ): Promise<{ id: string; reference: string; paidAt?: string }[]>;
  reorder(actorId: string, orderId: string): Promise<CartItem[]>;
}

export async function resumeAbandonedCheckout(
  provider: ResumeCheckoutProvider,
  actorId: string,
  familyId: string | undefined,
  reference: string | undefined
): Promise<{ cart: CartItem[]; restored: boolean }> {
  const cart = await provider.getCart(actorId);
  if (!reference || !familyId || cart.length > 0) return { cart, restored: false };

  const orders = await provider.getOrdersForFamily(actorId, familyId);
  const left = orders.find((order) => order.reference === reference && !order.paidAt);
  if (!left) return { cart, restored: false };

  const restored = await provider.reorder(actorId, left.id);
  return { cart: restored, restored: restored.length > 0 };
}
