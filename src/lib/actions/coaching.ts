"use server";

import { revalidatePath } from "next/cache";
import {
  bookCoachingSession,
  cancelCoachingSession,
} from "@/lib/api/coaching/booking";
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
