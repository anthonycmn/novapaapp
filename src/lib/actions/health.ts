"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

const answersSchema = z.object({
  allergies: z.string().max(1000),
  medications: z.string().max(1000),
  medicationAuthorization: z.boolean(),
  conditions: z.string().max(1000),
  physicianName: z.string().min(1, "Physician name is required").max(120),
  physicianPhone: z.string().min(7, "Physician phone is required").max(30),
  insuranceCarrier: z.string().max(120),
  insurancePolicyNumber: z.string().max(60),
  emergencyTreatmentConsent: z.literal(true, {
    errorMap: () => ({ message: "Emergency treatment consent is required to participate" }),
  }),
  dietaryRestrictions: z.string().max(1000),
  accessibilityNeeds: z.string().max(1000),
});

const signatureSchema = z.string().min(2, "Type your full name to sign");

export async function saveHealthFormAction(
  studentId: string,
  seasonId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = answersSchema.safeParse({
    allergies: String(formData.get("allergies") ?? ""),
    medications: String(formData.get("medications") ?? ""),
    medicationAuthorization: formData.get("medicationAuthorization") === "on",
    conditions: String(formData.get("conditions") ?? ""),
    physicianName: String(formData.get("physicianName") ?? ""),
    physicianPhone: String(formData.get("physicianPhone") ?? ""),
    insuranceCarrier: String(formData.get("insuranceCarrier") ?? ""),
    insurancePolicyNumber: String(formData.get("insurancePolicyNumber") ?? ""),
    emergencyTreatmentConsent: formData.get("emergencyTreatmentConsent") === "on",
    dietaryRestrictions: String(formData.get("dietaryRestrictions") ?? ""),
    accessibilityNeeds: String(formData.get("accessibilityNeeds") ?? ""),
  });

  const signatureRaw = String(formData.get("signature") ?? "").trim();
  const signatureParsed = signatureSchema.safeParse(signatureRaw);

  if (!parsed.success || !signatureParsed.success) {
    const errors: Record<string, string> = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0] ?? "_form")] = issue.message;
      }
    }
    if (!signatureParsed.success) {
      errors.signature = signatureParsed.error.issues[0].message;
    }
    return { ok: false, errors };
  }

  // E-signature provenance: name + timestamp + IP (#9).
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0].trim() ??
    headerList.get("x-real-ip") ??
    "unknown";

  await getProvider().saveHealthForm(user.id, studentId, seasonId, parsed.data, {
    name: signatureParsed.data,
    ip,
  });

  revalidatePath(`/family/students/${studentId}/health`);
  revalidatePath("/family");
  return { ok: true };
}
