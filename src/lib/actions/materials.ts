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

/**
 * Everything a family brings to an audition is a link they host.
 *
 * Videos and the show's resume went first (2 Sep), then the headshot, then the
 * recording and the profile resume (3 Sep: "make the recording and resume links
 * too"). So there is one shape of check for all of them, in one place: http(s)
 * or nothing, a length bound, and an empty value that clears the field.
 *
 * Clearing matters as much as setting. "Empty the box and save" is now how a
 * family takes a recording down, which is why there is no separate remove
 * action any more.
 */
function readLink(
  formData: FormData,
  field: string
): { url: string } | { error: FamilyFormState } {
  const url = String(formData.get(field) ?? "").trim();
  if (url && !/^https?:\/\/\S+$/i.test(url)) {
    return {
      error: {
        ok: false,
        errors: {
          [field]: "That doesn't look like a web link — it should start with https://",
        },
      },
    };
  }
  if (url.length > 1000) {
    return { error: { ok: false, errors: { [field]: "That link is too long" } } };
  }
  return { url };
}

/** The pages that show a student's materials, refreshed after any of them save. */
function revalidateMaterials(studentId: string): void {
  revalidatePath(`/family/students/${studentId}`);
  revalidatePath(`/family/students/${studentId}/resume`);
  revalidatePath("/auditions");
}

/**
 * The headshot as a link, from the audition page (Tony, 3 Sep 2026: "make the
 * headshot a link too").
 *
 * This is now the ONLY way a family sets a face. The profile form used to have
 * an upload writing the same column, so the last screen saved won silently;
 * that came out the same day ("yes remove the profile photo upload too").
 */
export async function saveHeadshotLinkAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const read = readLink(formData, "headshotUrl");
  if ("error" in read) return read.error;

  try {
    await getProvider().setHeadshotLink(user.id, studentId, read.url);
  } catch (error) {
    return failure(error);
  }
  revalidateMaterials(studentId);
  return { ok: true };
}

export async function saveAuditionAudioLinkAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const read = readLink(formData, "auditionAudioUrl");
  if ("error" in read) return read.error;

  try {
    await getProvider().setAuditionAudioLink(user.id, studentId, read.url);
  } catch (error) {
    return failure(error);
  }
  revalidateMaterials(studentId);
  return { ok: true };
}

export async function saveResumePdfLinkAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const read = readLink(formData, "resumePdfUrl");
  if ("error" in read) return read.error;

  try {
    await getProvider().setResumePdfLink(user.id, studentId, read.url);
  } catch (error) {
    return failure(error);
  }
  revalidateMaterials(studentId);
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
