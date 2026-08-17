"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import type { ResumeCredit } from "@/lib/api/types";
import { UploadRejectedError } from "@/lib/api/storage";
import type { DocumentCategory } from "@/lib/api/documents/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

function failure(error: unknown): FamilyFormState {
  return {
    ok: false,
    errors: {
      _form:
        error instanceof UploadRejectedError || error instanceof Error
          ? error.message
          : String(error),
    },
  };
}

/* ── student materials (#4) ─────────────────────────────────────────────── */

export async function saveHeadshotAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const webDataUrl = String(formData.get("webDataUrl") ?? "");
  const printDataUrl = String(formData.get("printDataUrl") ?? "");
  if (!webDataUrl || !printDataUrl) {
    return { ok: false, errors: { _form: "Crop a photo first" } };
  }

  try {
    await getProvider().setHeadshot(user.id, studentId, { webDataUrl, printDataUrl });
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/family/students/${studentId}`);
  revalidatePath(`/family/students/${studentId}/materials`);
  return { ok: true };
}

export async function saveAuditionAudioAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const dataUrl = String(formData.get("audioDataUrl") ?? "");
  if (!dataUrl) return { ok: false, errors: { _form: "Choose a recording first" } };

  try {
    await getProvider().setAuditionAudio(user.id, studentId, dataUrl);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/family/students/${studentId}/materials`);
  return { ok: true };
}

export async function clearAuditionAudioAction(studentId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().clearAuditionAudio(user.id, studentId);
  revalidatePath(`/family/students/${studentId}/materials`);
}

export async function saveResumePdfAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const dataUrl = String(formData.get("pdfDataUrl") ?? "");
  if (!dataUrl) return { ok: false, errors: { _form: "Choose a PDF first" } };

  try {
    await getProvider().setResumePdf(user.id, studentId, dataUrl);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/family/students/${studentId}/materials`);
  return { ok: true };
}

const creditSchema = z.object({
  category: z.enum(["role", "training", "special_skill"]),
  title: z.string().min(1).max(160),
  organization: z.string().max(120).optional(),
  year: z.string().max(12).optional(),
  notes: z.string().max(300).optional(),
});

export async function saveResumeCreditsAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  // The client submits the whole list as JSON so rows can be added and
  // reordered without a round trip per change.
  let parsedRows: unknown;
  try {
    parsedRows = JSON.parse(String(formData.get("credits") ?? "[]"));
  } catch {
    return { ok: false, errors: { _form: "Could not read the resume rows" } };
  }

  const result = z.array(creditSchema).max(200).safeParse(parsedRows);
  if (!result.success) {
    return { ok: false, errors: { _form: "One of the rows is incomplete" } };
  }

  const credits: ResumeCredit[] = result.data.map((row, index) => ({
    id: `rc-${index}`,
    ...row,
  }));

  try {
    await getProvider().saveResumeCredits(user.id, studentId, credits);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/family/students/${studentId}/materials`);
  revalidatePath(`/family/students/${studentId}/resume`);
  return { ok: true };
}

/* ── household document vault (#3) ──────────────────────────────────────── */

export async function uploadDocumentAction(
  familyId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "other") as DocumentCategory;
  const dataUrl = String(formData.get("fileDataUrl") ?? "");
  const studentId = String(formData.get("studentId") ?? "") || undefined;

  if (!name) return { ok: false, errors: { name: "Give the document a name" } };
  if (!dataUrl) return { ok: false, errors: { _form: "Choose a file first" } };

  try {
    await getProvider().uploadFamilyDocument(user.id, familyId, {
      name,
      category,
      dataUrl,
      studentId,
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/family/documents");
  return { ok: true };
}

export async function deleteDocumentAction(documentId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().deleteFamilyDocument(user.id, documentId);
  revalidatePath("/family/documents");
}

/* ── staff self-edit (#14) ──────────────────────────────────────────────── */

export async function submitStaffChangesAction(
  staffId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }

  const specialtiesRaw = String(formData.get("specialties") ?? "");
  try {
    await getProvider().submitStaffProfileChanges(user.id, staffId, {
      bio: String(formData.get("bio") ?? ""),
      title: String(formData.get("title") ?? ""),
      credits: String(formData.get("credits") ?? ""),
      familyMessage: String(formData.get("familyMessage") ?? ""),
      specialties: specialtiesRaw
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
      photoDataUrl: String(formData.get("photoDataUrl") ?? "") || undefined,
    });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/staff/edit");
  revalidatePath("/admin/staff-profiles");
  return { ok: true };
}

export async function approveStaffChangesAction(staffId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) return;
  await getProvider().approveStaffChanges(user.id, staffId);
  revalidatePath("/admin/staff-profiles");
  revalidatePath("/staff");
}

export async function rejectStaffChangesAction(
  staffId: string,
  formData: FormData
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) return;
  const reason = String(formData.get("reason") ?? "").trim() || "Please revise and resubmit.";
  await getProvider().rejectStaffChanges(user.id, staffId, reason);
  revalidatePath("/admin/staff-profiles");
}
