import type { Enrollment } from "@/lib/api/types";

/**
 * Is this enrollment still running?
 *
 * Nothing ever ended an enrollment: Dear Evan Hansen closed Aug 14 2026 and
 * its 24 rows sat "enrolled" on every family's dashboard as "run under way"
 * three weeks later (Sep 5 audit). The session dates the sync captures are
 * the honest signal — an enrollment whose care window has closed is history,
 * not a current commitment, and stops counting toward balances, tiles and
 * show cards.
 *
 * A three-day grace keeps the show on the dashboard through closing weekend
 * ("did wonderful work" notes, strike volunteering) rather than vanishing it
 * at midnight after the last performance. Rows with no session dates are
 * treated as current — the safer direction, and the pre-audit behavior.
 */
const GRACE_DAYS = 3;

export function enrollmentIsCurrent(enrollment: Enrollment): boolean {
  if (enrollment.status === "withdrawn") return false;
  const ends = enrollment.sessionEndsOn;
  if (!ends) return true;
  const cutoff = new Date(ends);
  cutoff.setDate(cutoff.getDate() + GRACE_DAYS);
  return cutoff.getTime() >= Date.now();
}
