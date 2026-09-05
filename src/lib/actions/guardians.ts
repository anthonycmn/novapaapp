"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { assertUploadAllowed } from "@/lib/api/storage";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

/**
 * Parents editing their own contact details, and adding the other grown-ups.
 *
 * Tony, 17 Aug 2026: "I want the parents to also be able to update their
 * information, their name, their email address, their phone numbers. Add a
 * second parent, add a third parent, add a fourth parent if they would like to."
 *
 * A household keeps its own phone numbers current far better than an office
 * can, so this is theirs to change. What is NOT theirs: `isPrimary` and the
 * linked `userId`, which decide whose account this is — neither is in the
 * provider's patch type, so a crafted form cannot reach them.
 */

const guardianSchema = z.object({
  fullName: z.string().trim().min(1, "Enter a name").max(80),
  // Optional so a household can record a grandparent who has no email, but it
  // must be a real address when given — a typo here is a family that stops
  // hearing from us and never finds out why.
  email: z.union([z.string().trim().email("Enter a valid email address"), z.literal("")]),
  phone: z.string().trim().max(30),
  relationship: z.string().trim().max(40),
});

function fieldErrors(error: z.ZodError, prefix = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    errors[`${prefix}${String(issue.path[0] ?? "_form")}`] = issue.message;
  }
  return errors;
}

/** Everything a parent can change about one guardian, including their photo. */
export async function updateGuardianAction(
  guardianId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = guardianSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    relationship: formData.get("relationship") ?? "",
  });
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };

  const photoDataUrl = String(formData.get("photoDataUrl") ?? "");
  if (photoDataUrl) {
    try {
      assertUploadAllowed("button-photos", photoDataUrl);
    } catch (error) {
      return {
        ok: false,
        errors: { photoDataUrl: error instanceof Error ? error.message : "Bad photo" },
      };
    }
  }

  try {
    await getProvider().updateGuardian(user.id, guardianId, {
      ...parsed.data,
      // An empty string would blank a photo they never touched, so only send it
      // when they actually chose one this time.
      ...(photoDataUrl ? { photoUrl: photoDataUrl } : {}),
    });
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  await logActivity({
    user,
    action: "family.guardian_updated",
    summary: `Updated guardian ${parsed.data.fullName}${photoDataUrl ? " (new photo)" : ""}`,
    detail: { guardianId },
  });
  revalidatePath("/family");
  revalidatePath("/family/edit");
  return { ok: true };
}

/** "Add additional" — the third and fourth parent, and beyond. */
export async function addGuardianAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = guardianSchema.safeParse({
    fullName: formData.get("newFullName"),
    email: formData.get("newEmail") ?? "",
    phone: formData.get("newPhone") ?? "",
    relationship: formData.get("newRelationship") ?? "",
  });
  if (!parsed.success) {
    // Re-prefix so the new-guardian row shows its own errors rather than
    // lighting up every existing parent's name field.
    const errors: Record<string, string> = {};
    for (const [key, message] of Object.entries(fieldErrors(parsed.error))) {
      errors[`new${key.charAt(0).toUpperCase()}${key.slice(1)}`] = message;
    }
    return { ok: false, errors };
  }

  try {
    await getProvider().addGuardian(user.id, user.familyId, parsed.data);
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  await logActivity({
    user,
    action: "family.guardian_added",
    summary: `Added guardian ${parsed.data.fullName}${
      parsed.data.relationship ? ` (${parsed.data.relationship})` : ""
    }`,
  });
  revalidatePath("/family");
  revalidatePath("/family/edit");
  return { ok: true };
}
