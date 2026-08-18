/**
 * What the org charges families through the portal.
 *
 * One number, in cents, read by the fee calculation AND by the sentence the
 * parent reads before they submit. The two used to be written separately —
 * a rate in two providers and a price in a paragraph — which is how a form
 * ends up quoting a figure the invoice contradicts.
 */

/**
 * Extended care, per day.
 *
 * Tony, 18 Aug 2026: "Extended care is fifteen dollars, not five dollars."
 */
export const EXTENDED_CARE_DAY_CENTS = 1500;
