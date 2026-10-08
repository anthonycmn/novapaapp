"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

/**
 * Volunteer sign-ups, from the family's side — hub 0048, 0096.
 *
 * The sheets are built in the staff portal and are the same rows; this is the
 * taking, the moving and the giving back.
 *
 * Nothing that matters is checked here. Capacity is checked in
 * claim_volunteer_slot() with the slot row locked, because two parents can tap
 * the last place in the same second; the 24-hour line is held by
 * release_/move_volunteer_signup(). What comes back is a verdict, and a
 * refusal is a sentence to show the parent, not an error.
 */

function fail(error: unknown): FamilyFormState {
  return {
    ok: false,
    errors: { _form: error instanceof Error ? error.message : String(error) },
  };
}

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const claimSchema = z.object({
  slotId: z.string().min(1),
  volunteerName: z.string().trim().min(1, "Say who is coming.").max(120),
  phone: optional(40),
  note: optional(500),
  bringing: optional(200),
  badgeOk: z.boolean(),
  badgeName: optional(40),
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
      phone: formData.get("phone") ?? undefined,
      note: formData.get("note") ?? undefined,
      bringing: formData.get("bringing") ?? undefined,
      badgeOk: formData.get("badgeOk") === "on",
      badgeName: formData.get("badgeName") ?? undefined,
    });
    if (!parsed.success) {
      return fail(new Error(parsed.error.issues[0]?.message ?? "Check the form."));
    }

    const result = await getProvider().claimVolunteerSlot(user.id, parsed.data);
    if (!result.ok) return fail(new Error(result.message ?? "That slot could not be taken."));

    await logActivity({
      user,
      action: "volunteers.slot_claimed",
      summary: `Signed up ${parsed.data.volunteerName} for a volunteer slot`,
      detail: {
        slotId: parsed.data.slotId,
        bringing: parsed.data.bringing ?? null,
        badge: parsed.data.badgeOk,
      },
    });
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

    const result = await getProvider().releaseVolunteerSlot(user.id, signupId);
    if (!result.ok) return fail(new Error(result.message ?? "That place could not be given back."));

    await logActivity({
      user,
      action: "volunteers.slot_released",
      summary: "Gave back a volunteer slot",
      detail: { signupId },
    });
    revalidatePath("/volunteers");
    return { ok: true, errors: {} };
  } catch (error) {
    return fail(error);
  }
}

export async function moveVolunteerSlotAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  try {
    const user = await getSessionUser();
    if (!user?.familyId) return fail(new Error("Sign in first."));

    const signupId = String(formData.get("signupId") ?? "");
    const toSlotId = String(formData.get("toSlotId") ?? "");
    if (!signupId || !toSlotId) return fail(new Error("Pick the slot to move to."));

    const result = await getProvider().moveVolunteerSlot(user.id, signupId, toSlotId);
    if (!result.ok) return fail(new Error(result.message ?? "That move could not be made."));

    await logActivity({
      user,
      action: "volunteers.slot_moved",
      summary: "Moved a volunteer sign-up to another slot",
      detail: { signupId, toSlotId },
    });
    revalidatePath("/volunteers");
    return { ok: true, errors: {} };
  } catch (error) {
    return fail(error);
  }
}
