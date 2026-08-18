"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { parseEmergencyContacts } from "@/lib/family/emergency-contacts";

const familySchema = z.object({
  addressLine1: z.string().min(1, "Street address is required"),
  addressLine2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().length(2, "Use the two-letter state code"),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a valid ZIP code"),
  preferredContactMethod: z.enum(["email", "sms", "phone"]),
});

export type FamilyFormState = {
  ok: boolean;
  errors?: Record<string, string>;
};

export async function updateFamilyAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = familySchema.safeParse({
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2") || undefined,
    city: formData.get("city"),
    state: String(formData.get("state") ?? "").toUpperCase(),
    zip: formData.get("zip"),
    preferredContactMethod: formData.get("preferredContactMethod"),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  await getProvider().updateFamily(user.id, user.familyId, parsed.data);
  revalidatePath("/family");
  // Also the page the form is ON. Without it a parent who saves, then comes
  // back to edit something else, is handed the values they just replaced —
  // which reads as a save that did not take.
  revalidatePath("/family/edit");
  return { ok: true };
}

const guardianInviteSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  relationship: z.string().min(1, "Relationship is required"),
});

export async function inviteGuardianAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = guardianInviteSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    relationship: formData.get("relationship"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  await getProvider().inviteGuardian(user.id, user.familyId, parsed.data);
  // Real email invite goes out via the EmailProvider in Phase 2.
  revalidatePath("/family");
  return { ok: true };
}

/**
 * Emergency contacts — the grown-up who is not a parent.
 *
 * The profile review has always called a household with none of these
 * incomplete, and the red alert it raises links to /family/edit. Until now
 * there was nothing on that page to fill in, so a parent could follow the
 * alert, save everything they could see, and watch it stay red: the family
 * information they were being asked for had nowhere to go. That is the "it
 * isn't saving" this fixes.
 *
 * The whole list posts at once and replaces what was there, so removing a
 * contact is an ordinary save rather than a separate delete that can
 * half-succeed. The rules live in @/lib/family/emergency-contacts, where they
 * can be tested without a session.
 */
export async function saveEmergencyContactsAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, errors: { _form: "Not signed in" } };

  const ids = formData.getAll("ecId").map(String);
  const names = formData.getAll("ecName").map(String);
  const phones = formData.getAll("ecPhone").map(String);
  const relationships = formData.getAll("ecRelationship").map(String);

  const { contacts, errors } = parseEmergencyContacts(
    names.map((fullName, index) => ({
      id: ids[index] ?? "",
      fullName,
      phone: phones[index] ?? "",
      relationship: relationships[index] ?? "",
    })),
    randomUUID
  );

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  try {
    await getProvider().updateFamily(user.id, user.familyId, {
      emergencyContacts: contacts,
    });
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  revalidatePath("/family");
  revalidatePath("/family/edit");
  return { ok: true };
}
