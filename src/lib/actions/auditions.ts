"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import type { Discipline, RoleTier } from "@/lib/api/auditions/types";
import { RUBRIC_CRITERIA } from "@/lib/api/auditions/types";
import { logActivity } from "@/lib/activity";
import { auditionUrl, sendAuditionReceipt } from "@/lib/api/auditions/notify";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";
import { profileSchema, type AuditionSubmitState } from "./audition-schema";

function fail(error: unknown): FamilyFormState {
  return {
    ok: false,
    errors: { _form: error instanceof Error ? error.message : String(error) },
  };
}


export async function submitAuditionProfileAction(
  _prev: AuditionSubmitState,
  formData: FormData
): Promise<AuditionSubmitState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = profileSchema.safeParse({
    studentId: formData.get("studentId"),
    productionId: formData.get("productionId"),
    // getAll: the tier question posts one value per box ticked (hub 0078).
    preferenceTiers: formData.getAll("preferenceTiers").map(String),
    previousRoles: String(formData.get("previousRoles") ?? ""),
    hopes: String(formData.get("hopes") ?? ""),
    wantsSpeaking: formData.get("wantsSpeaking") === "on",
    wantsSinging: formData.get("wantsSinging") === "on",
    wantsDance: formData.get("wantsDance") === "on",
    songTitle: String(formData.get("songTitle") ?? "").trim(),
    songUrl: String(formData.get("songUrl") ?? "").trim(),
    // Trimmed: a link pasted off a phone arrives with a space on the end more
    // often than not, and " https://…" would fail the check for no reason.
    auditionVideoUrl: String(formData.get("auditionVideoUrl") ?? "").trim(),
    danceVideoUrl: String(formData.get("danceVideoUrl") ?? "").trim(),
    resumeUrl: String(formData.get("resumeUrl") ?? "").trim(),
    inPersonWithBackingTrack: formData.get("inPersonWithBackingTrack") === "on",
    notes: String(formData.get("notes") ?? ""),
    acknowledged: formData.get("acknowledged") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  /*
   * Whether this is the first time through or an edit decides two sentences:
   * the page heading and the email subject. Read before the write, because
   * after it there is always a row.
   */
  const before = await getProvider()
    .getAuditionProfile(user.id, parsed.data.studentId, parsed.data.productionId)
    .catch(() => null);
  const isUpdate = Boolean(before);

  let saved;
  try {
    saved = await getProvider().submitAuditionProfile(user.id, {
      studentId: parsed.data.studentId,
      productionId: parsed.data.productionId,
      preferenceTiers: parsed.data.preferenceTiers as RoleTier[],
      previousRoles: parsed.data.previousRoles,
      hopes: parsed.data.hopes,
      wantsSpeaking: parsed.data.wantsSpeaking,
      wantsSinging: parsed.data.wantsSinging,
      wantsDance: parsed.data.wantsDance,
      songTitle: parsed.data.songTitle,
      songUrl: parsed.data.songUrl,
      // The uploader always posts these fields, so an empty string here is a
      // deliberate clear rather than an absent field.
      auditionVideoUrl: parsed.data.auditionVideoUrl,
      danceVideoUrl: parsed.data.danceVideoUrl,
      resumeUrl: parsed.data.resumeUrl,
      notes: parsed.data.notes,
      acknowledgedNoGuarantee: true,
    });
  } catch (error) {
    return fail(error);
  }
  const [production, students] = await Promise.all([
    getProvider().getProduction(parsed.data.productionId).catch(() => null),
    user.familyId
      ? getProvider().getStudentsForFamily(user.id, user.familyId).catch(() => [])
      : Promise.resolve([]),
  ]);
  const student = students.find((entry) => entry.id === parsed.data.studentId);
  const studentName = student ? (student.preferredName ?? student.firstName) : "Your performer";

  /*
   * The receipt email — CJ, 8 Sep 2026: "send them an email that says your
   * audition information has been submitted. Thank you. The staff will review
   * it shortly." Best-effort: the row is saved and the code is on the next
   * page whether or not the mail goes, and a mail outage must not turn a
   * successful submission into a red box.
   */
  const emailed = saved.confirmationCode
    ? await sendAuditionReceipt(user.email, {
        studentName,
        productionTitle: production?.title ?? "the show",
        confirmationCode: saved.confirmationCode,
        isUpdate,
        auditionUrl: auditionUrl(parsed.data.productionId, parsed.data.studentId),
      })
    : false;

  await logActivity({
    user,
    action: isUpdate ? "audition.profile_updated" : "audition.profile_submitted",
    summary: `${isUpdate ? "Updated" : "Submitted"} an audition profile${production ? ` — ${production.title}` : ""}`,
    studentId: parsed.data.studentId,
    detail: {
      productionId: parsed.data.productionId,
      preferenceTiers: parsed.data.preferenceTiers,
      confirmationCode: saved.confirmationCode ?? null,
      receiptEmailed: emailed,
    },
  });
  revalidatePath("/auditions");
  revalidatePath(`/auditions/${parsed.data.productionId}/${parsed.data.studentId}`);
  return {
    ok: true,
    redirectTo: `/auditions/${parsed.data.productionId}/${parsed.data.studentId}/submitted${isUpdate ? "?updated=1" : ""}`,
  };
}

export async function submitEvaluationAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }

  const discipline = String(formData.get("discipline")) as Discipline;
  if (!RUBRIC_CRITERIA[discipline]) {
    return { ok: false, errors: { _form: "Pick a discipline" } };
  }
  const scores: Record<string, number> = {};
  for (const criterion of RUBRIC_CRITERIA[discipline]) {
    scores[criterion.key] = Number(formData.get(`score_${criterion.key}`) ?? 0);
  }

  const productionId = String(formData.get("productionId"));
  try {
    await getProvider().submitEvaluation(user.id, {
      studentId: String(formData.get("studentId")),
      productionId,
      discipline,
      scores,
      notes: String(formData.get("notes") ?? ""),
      callbackNotes: String(formData.get("callbackNotes") ?? ""),
      growthNotes: String(formData.get("growthNotes") ?? "") || undefined,
    });
  } catch (error) {
    return fail(error);
  }
  // Must be the exact dynamic path — revalidating the bare parent segment
  // does not invalidate /admin/auditions/[productionId], so the "n/3
  // scored" summary went stale after a save.
  revalidatePath(`/admin/auditions/${productionId}`);
  return { ok: true };
}

export async function assignRoleAction(
  productionId: string,
  roleId: string,
  studentId: string
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await getProvider().assignRole(user.id, productionId, roleId, studentId);
  revalidatePath(`/admin/casting/${productionId}`);
}

export async function unassignRoleAction(
  productionId: string,
  studentId: string
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await getProvider().unassignRole(user.id, productionId, studentId);
  revalidatePath(`/admin/casting/${productionId}`);
}

export async function submitCastingAction(
  productionId: string,
  prev: FamilyFormState
): Promise<FamilyFormState> {
  // prev is required by the useActionState contract; unused beyond that.
  void prev;
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }
  try {
    await getProvider().submitCasting(user.id, productionId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/admin/casting/${productionId}`);
  return { ok: true };
}

export async function assignUnderstudyAction(
  productionId: string,
  roleId: string,
  studentId: string
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await getProvider().assignUnderstudy(user.id, productionId, roleId, studentId);
  revalidatePath(`/admin/casting/${productionId}`);
}

export async function unassignUnderstudyAction(
  productionId: string,
  studentId: string
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await getProvider().unassignUnderstudy(user.id, productionId, studentId);
  revalidatePath(`/admin/casting/${productionId}`);
}

export async function publishUnderstudiesAction(
  productionId: string,
  prev: FamilyFormState
): Promise<FamilyFormState> {
  void prev;
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }
  try {
    await getProvider().publishUnderstudies(user.id, productionId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath(`/admin/casting/${productionId}`);
  return { ok: true };
}

export async function respondToCastingAction(
  confirmationId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const nameCorrect = formData.get("decision") === "yes";
  try {
    await getProvider().respondToCasting(user.id, confirmationId, {
      nameCorrect,
      playbillName: String(formData.get("playbillName") ?? "") || undefined,
    });
  } catch (error) {
    return fail(error);
  }
  await logActivity({
    user,
    action: "casting.responded",
    summary: nameCorrect
      ? "Confirmed their child's playbill name"
      : "Asked for a playbill name correction",
    detail: { confirmationId },
  });
  revalidatePath("/casting");
  return { ok: true };
}

export async function requestFeedbackAction(confirmationId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().requestAuditionFeedback(user.id, confirmationId);
  await logActivity({
    user,
    action: "casting.feedback_requested",
    summary: "Requested audition feedback",
    detail: { confirmationId },
  });
  revalidatePath("/casting");
}
