"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import type { UploadSource } from "@/lib/api/storage";
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

/**
 * The headshot as a link, from the audition page (Tony, 3 Sep 2026: "make the
 * headshot a link too").
 *
 * The photo on the profile page is still an upload and still writes the same
 * column — that one exists so staff can put a face to a name at check-in, and
 * a parent adding it there is not thinking about auditions. Whichever was set
 * last is the headshot.
 *
 * An empty value clears it, which is how somebody takes a headshot down.
 */
export async function saveHeadshotLinkAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const url = String(formData.get("headshotUrl") ?? "").trim();
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return {
      ok: false,
      errors: {
        headshotUrl: "That doesn't look like a web link — it should start with https://",
      },
    };
  }
  if (url.length > 1000) {
    return { ok: false, errors: { headshotUrl: "That link is too long" } };
  }

  try {
    await getProvider().setHeadshotLink(user.id, studentId, url);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(`/family/students/${studentId}`);
  revalidatePath("/auditions");
  return { ok: true };
}

export async function saveAuditionAudioAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const source = storedUpload(formData, "audioPath");
  if (!source) return { ok: false, errors: { _form: "Choose a recording first" } };

  try {
    await getProvider().setAuditionAudio(user.id, studentId, source);
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

  const source = storedUpload(formData, "resumePdfPath");
  if (!source) return { ok: false, errors: { _form: "Choose a PDF first" } };

  try {
    await getProvider().setResumePdf(user.id, studentId, source);
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

/**
 * What a direct upload leaves in the form.
 *
 * Only the storage PATH comes back, never an address — the server rebuilds the
 * URL from the path so a family cannot record an arbitrary one against their
 * own paperwork. The type and size travel with it for the record's own
 * metadata, and resolveUpload() bounds them against the bucket's limits rather
 * than believing them.
 */
function storedUpload(formData: FormData, field: string): UploadSource | null {
  const storagePath = String(formData.get(field) ?? "");
  if (!storagePath) return null;
  return {
    kind: "stored",
    storagePath,
    contentType: String(formData.get(`${field}ContentType`) ?? ""),
    sizeBytes: Number(formData.get(`${field}SizeBytes`) ?? 0),
  };
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
  const studentId = String(formData.get("studentId") ?? "") || undefined;
  const source = storedUpload(formData, "filePath");

  if (!name) return { ok: false, errors: { name: "Give the document a name" } };
  if (!source) return { ok: false, errors: { _form: "Choose a file first" } };

  /*
   * familyId is checked by the provider's family rule, and the signing route
   * scoped the storage path to the caller's own household, so the two have to
   * agree or resolveUpload() refuses the claim. That does mean a staff member
   * cannot file into a family's vault through THIS action — no staff surface
   * uses it today, and one would need its own signing scope.
   */
  try {
    await getProvider().uploadFamilyDocument(user.id, familyId, {
      name,
      category,
      source,
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
