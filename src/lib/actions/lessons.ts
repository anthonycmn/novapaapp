"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

export async function bookLessonAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const slotId = String(formData.get("slotId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!slotId || !studentId) {
    return { ok: false, errors: { _form: "Pick a time and a student" } };
  }

  try {
    await getProvider().bookLessonSlot(user.id, {
      slotId,
      studentId,
      goals: String(formData.get("goals") ?? ""),
    });
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }
  await logActivity({
    user,
    action: "lessons.booked",
    summary: "Booked a private lesson",
    studentId,
    detail: { slotId },
  });
  revalidatePath("/store/lessons");
  revalidatePath("/schedule");
  return { ok: true };
}

export async function cancelLessonBookingAction(bookingId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().cancelLessonBooking(user.id, bookingId);
  await logActivity({
    user,
    action: "lessons.cancelled",
    summary: "Cancelled a private lesson booking",
    detail: { bookingId },
  });
  revalidatePath("/store/lessons");
  revalidatePath("/schedule");
}
