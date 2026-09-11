"use server";

import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { TOUR_VERSION, type TourOutcome } from "@/lib/tour";

/**
 * Record that the signed-in person has been shown around (0083).
 *
 * The version is the app's, not the browser's: whatever a hand-made request
 * says, what is recorded is the tour this build actually showed. The outcome
 * is checked to the two words the table accepts.
 */
export async function markTourSeenAction(outcome: TourOutcome): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const safeOutcome: TourOutcome = outcome === "finished" ? "finished" : "skipped";
  await getProvider().markTourSeen(user.id, TOUR_VERSION, safeOutcome);
  /*
   * No revalidatePath: the tour has already closed on screen, and the next
   * visit to the dashboard reads the row. Re-rendering a dozen queries to
   * confirm a checkbox would buy a flicker and nothing else.
   */
}
