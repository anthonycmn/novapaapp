import "server-only";
import {
  getPortalReadClient,
  getPortalRpcClient,
  isSupabaseConfigured,
} from "../supabase/client";
import { offerFromRow, type CoachingPackageOffer } from "./offers";

export {
  COACHING_REFERENCE_PREFIX,
  isCoachingReference,
  type CoachingPackageOffer,
} from "./offers";

/**
 * Buying the sessions a family then books.
 *
 * 0153 refused a booking when the family had no balance. This is what turns
 * that refusal into something they can act on — and it is the only part of
 * coaching that touches money, so the rules that protect it live in the
 * database (portal 0154), not here:
 *
 *   · the PRICE and the SESSION COUNT are read from the menu server-side.
 *     This module sends a menu id and never an amount, so there is nothing
 *     for a tampered form to overstate.
 *   · the balance is created only when payment CONFIRMS. Starting a checkout
 *     writes a pending row and no sessions, so an abandoned Stripe page has
 *     bought nothing.
 *   · completing twice is safe, because Stripe retries webhooks and a second
 *     credit would be a gift.
 *
 * Only session packages are sold here. The rest of the coaching menu — brand
 * design, pre-screen videos, the full-season package — are services CJ
 * delivers rather than balances anybody books against, and the portal does not
 * pretend to sell them.
 */

export interface StartedPurchase {
  reference: string;
  service: string;
  sessions: number;
  amountCents: number;
  studentName: string;
}

/**
 * What is on sale, if anything.
 *
 * Returns an empty list when the portal is unreachable — and, far more often,
 * when nobody has ticked `portal_buyable` on any menu row yet. Both mean the
 * same thing to a parent: there is nothing to buy here, so ask the office.
 */
export async function getCoachingShop(): Promise<CoachingPackageOffer[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { data, error } = await getPortalReadClient()
      .from("v_coaching_shop_public")
      .select("menu_id, service, category, price, sessions")
      .order("sessions");
    if (error) throw error;
    return (data ?? []).flatMap((row) => {
      const offer = offerFromRow(row as Record<string, unknown>);
      return offer ? [offer] : [];
    });
  } catch {
    return [];
  }
}

/** Reserve a purchase. Creates no balance — see the note at the top. */
export async function startCoachingPurchase(
  familyId: string,
  studentId: string,
  menuId: string
): Promise<StartedPurchase> {
  const { data, error } = await getPortalRpcClient().rpc(
    "family_start_coaching_purchase",
    { p_family_id: familyId, p_student_id: studentId, p_menu_id: menuId }
  );
  if (error) {
    throw new Error((error.message ?? "").replace(/^.*?:\s*/, "").trim() ||
      "That package could not be reserved.");
  }
  return data as StartedPurchase;
}

/** Turn a confirmed payment into a bookable balance. Safe to call twice. */
export async function completeCoachingPurchase(
  reference: string,
  paymentRef: string
): Promise<{ ok: boolean; packageId?: string; alreadyPaid?: boolean; reason?: string }> {
  const { data, error } = await getPortalRpcClient().rpc(
    "family_complete_coaching_purchase",
    { p_reference: reference, p_payment_ref: paymentRef }
  );
  if (error) return { ok: false, reason: error.message };
  return (data ?? { ok: false, reason: "no-response" }) as {
    ok: boolean;
    packageId?: string;
    alreadyPaid?: boolean;
    reason?: string;
  };
}
