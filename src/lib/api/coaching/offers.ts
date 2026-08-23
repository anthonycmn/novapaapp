/**
 * What a coaching package costs, and how a payment finds its way home.
 *
 * Pure on purpose — no server-only import — because these two things decide
 * where money lands and both are worth testing directly:
 *
 *   · reading a price list row without trusting it, and
 *   · telling a coaching purchase apart from a store order when Stripe calls
 *     back, since both arrive at the same webhook.
 */

/** A package a family may buy. Shaped by `v_coaching_shop_public`. */
export interface CoachingPackageOffer {
  menuId: string;
  service: string;
  category?: string;
  sessions: number;
  priceCents: number;
}

/**
 * Coaching purchases carry this prefix; store orders carry "NPA-"
 * (`family_hub.next_order_reference`). One Stripe endpoint serves both, and
 * this is what keeps them apart.
 */
export const COACHING_REFERENCE_PREFIX = "COACH-";

/**
 * Whether a Stripe callback belongs to coaching.
 *
 * Deliberately strict about the shape rather than a bare `startsWith`: a
 * reference of exactly "COACH-" with nothing after it is not a real purchase,
 * and treating it as one would send a malformed callback down the crediting
 * path instead of being ignored.
 */
export function isCoachingReference(reference: string): boolean {
  return (
    typeof reference === "string" &&
    reference.startsWith(COACHING_REFERENCE_PREFIX) &&
    reference.length > COACHING_REFERENCE_PREFIX.length
  );
}

/**
 * One price-list row, or null if it is not sellable.
 *
 * The view already filters to buyable rows with a session count, so anything
 * rejected here means the data disagrees with itself. Dropping the row is the
 * right answer: a package with a nonsense price is one a parent must not be
 * shown, let alone charged for.
 *
 * The view holds dollars (numeric) and everything downstream counts in cents,
 * so this is also the one place that conversion happens.
 */
export function offerFromRow(row: Record<string, unknown>): CoachingPackageOffer | null {
  const menuId = typeof row.menu_id === "string" ? row.menu_id : null;
  if (!menuId) return null;

  const sessions = Number(row.sessions);
  if (!Number.isFinite(sessions) || sessions <= 0) return null;

  // Postgres numeric arrives as a string through PostgREST, so Number() is
  // doing real work here rather than tidying a number that was already one.
  const price = Number(row.price);
  if (!Number.isFinite(price) || price <= 0) return null;

  return {
    menuId,
    service: typeof row.service === "string" && row.service.trim()
      ? row.service.trim()
      : "Coaching sessions",
    category: typeof row.category === "string" ? row.category : undefined,
    sessions: Math.trunc(sessions),
    priceCents: Math.round(price * 100),
  };
}
