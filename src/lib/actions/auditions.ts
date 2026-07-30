"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import type { Discipline, RoleTier } from "@/lib/api/auditions/types";
import { RUBRIC_CRITERIA } from "@/lib/api/auditions/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

function fail(error: unknown): FamilyFormState {
  return {
    ok: false,
    errors: { _form: error instanceof Error ? error.message : String(error) },
  };
}

const profileSchema = z.object({
  studentId: z.string().min(1),
  productionId: z.string().min(1),
  preferenceTier: z.enum(["ensemble", "featured", "supporting", "lead"]),
  previousRoles: z.string().max(2000),
  hopes: z.string().max(2000),
  acknowledged: z.literal(true, {
    errorMap: () => ({
      message: "Please confirm you understand that a preference doesn't guarantee a part",
    }),
  }),
});

export async function submitAuditionProfileAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = profileSchema.safeParse({
    studentId: formData.get("studentId"),
    productionId: formData.get("productionId"),
    preferenceTier: formData.get("preferenceTier"),
    previousRoles: String(formData.get("previousRoles") ?? ""),
    hopes: String(formData.get("hopes") ?? ""),
    acknowledged: formData.get("acknowledged") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  try {
    await getProvider().submitAuditionProfile(user.id, {
      studentId: parsed.data.studentId,
      productionId: parsed.data.productionId,
      preferenceTier: parsed.data.preferenceTier as RoleTier,
      previousRoles: parsed.data.previousRoles,
      hopes: parsed.data.hopes,
      acknowledgedNoGuarantee: true,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/auditions");
  return { ok: true };
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

  try {
    await getProvider().submitEvaluation(user.id, {
      studentId: String(formData.get("studentId")),
      productionId: String(formData.get("productionId")),
      discipline,
      scores,
      notes: String(formData.get("notes") ?? ""),
      callbackNotes: String(formData.get("callbackNotes") ?? ""),
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/auditions");
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

export async function respondToCastingAction(
  confirmationId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const nameCorrect = formData.get("response") === "yes";
  try {
    await getProvider().respondToCasting(user.id, confirmationId, {
      nameCorrect,
      playbillName: String(formData.get("playbillName") ?? "") || undefined,
    });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/casting");
  return { ok: true };
}

export async function requestFeedbackAction(confirmationId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().requestAuditionFeedback(user.id, confirmationId);
  revalidatePath("/casting");
}
