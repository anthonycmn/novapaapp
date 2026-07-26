"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";

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
