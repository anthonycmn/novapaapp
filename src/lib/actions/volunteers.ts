"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

/**
 * Volunteer sign-ups, from the family's side — hub 0048.
 *
 * The sheets are built in the staff portal and are the same rows; this is only
 * the taking and the giving back.
 *
 * Capacity is NOT checked here. It is checked in claim_volunteer_slot() with
 * the slot row locked, because two parents can tap the last strike-night place
 * in the same second and any check made in this process would let both
 * through. What comes back is a verdict, and a refusal is a sentence to show
 * the parent — "somebody just took the last place on that one" — not an error.
 */

function fail(error: unknown): FamilyFormState {
  return {
    ok: false,
    errors: { _form: error instanceof Error ? error.message : String(error) },
  };
}

const claimSchema = z.object({
  slotId: z.string().min(1),
  volunteerName: z.string().trim().min(1, "Say who is coming.").max(120),
  phone: z.string().trim().max(40).optional(),
  note: z.string().trim().max(500).optional(),
});

export async function claimVolunteerSlotAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  try {
    const user = await getSessionUser();
    if (!user?.familyId) return fail(new Error("Sign in to volunteer."));

    const parsed = claimSchema.safeParse({
      slotId: formData.get("slotId"),
      volunteerName: formData.get("volunteerName"),
      phone: formData.get("phone") || undefined,
      note: formData.get("note") || undefined,
    });
    if (!parsed.success) {
      return fail(new Error(parsed.error.issues[0]?.message ?? "Check the form."));
    }

    const result = await getProvider().claimVolunteerSlot(user.id, parsed.data);
    if (!result.ok) return fail(new Error(result.message ?? "That slot could not be taken."));

    revalidatePath("/volunteers");
    return { ok: true, errors: {} };
  } catch (error) {
    return fail(error);
  }
}

export async function releaseVolunteerSlotAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  try {
    const user = await getSessionUser();
    if (!user?.familyId) return fail(new Error("Sign in first."));

    const signupId = String(formData.get("signupId") ?? "");
    if (!signupId) return fail(new Error("Nothing to give back."));

    await getProvider().releaseVolunteerSlot(user.id, signupId);
    revalidatePath("/volunteers");
    return { ok: true, errors: {} };
  } catch (error) {
    return fail(error);
  }
}
