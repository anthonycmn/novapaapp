"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import { refuseIfImpersonating } from "@/lib/auth/impersonation";
import { notifySubmission, submissionMessage } from "./notify-submission";
import type { FamilyFormState } from "./family";
import type { SubmissionState } from "./spirit-button";

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
): Promise<SubmissionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  /* Hub 0063. Asked before the input is even parsed: "may this session do this
     at all" comes before "is this any good". This form carries a signature,
     and the provenance stamp below records a name, a time and an IP against
     it — a Chief's IP under a parent's name is the row that must never be
     written. */
  const refused = await refuseIfImpersonating("health");
  if (refused) return { ok: false, errors: { _form: refused.message } };

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

  const provider = getProvider();
  await provider.saveHealthForm(user.id, studentId, seasonId, parsed.data, {
    name: signatureParsed.data,
    ip,
  });

  /**
   * Tell the office a form landed.
   *
   * Tony, 17 Aug 2026: "If they edit a health form, they need to hit a submit
   * button so that it syncs with the staff portal and we get it in the staff
   * portal." The signed form is already visible to staff the instant it saves —
   * RLS on health_forms grants is_staffish() read, and migration 0035 shapes it
   * for the staff portal — so there is no copy to push. What was missing is
   * anyone knowing to look.
   *
   * Deliberately no medical detail in the message. It says whose form and that
   * it is signed; the answers stay behind a login. An email is not the place to
   * put a child's allergies.
   */
  const student = await provider.getStudent(user.id, studentId);
  const childName = student
    ? `${student.preferredName ?? student.firstName} ${student.lastName}`
    : "a student";

  /* Deliberately no medical detail here either — the play-by-play says the
     form was signed, never what it says. */
  await logActivity({
    user,
    action: "health.form_signed",
    summary: `Signed the health form for ${childName}`,
    studentId,
    detail: { signedBy: signatureParsed.data },
  });

  const outcome = await notifySubmission({
    subject: `Health form signed — ${childName}`,
    category: "health_form_submitted",
    lines: [
      `${childName}'s health form has been signed and is on file.`,
      "",
      `Signed by: ${signatureParsed.data}`,
      `Submitted by ${user.displayName}${user.family ? ` (${user.family.name})` : ""}`,
      "",
      "The answers are in the portal — not in this email. Open the student's",
      "profile to read them.",
    ],
  });

  revalidatePath(`/family/students/${studentId}/health`);
  revalidatePath("/family");
  revalidatePath("/family/edit");
  return {
    ok: true,
    message: submissionMessage(
      outcome,
      "Staff can see it now. You can update and re-sign it any time."
    ),
  };
}
