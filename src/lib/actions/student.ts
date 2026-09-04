"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import {
  parseStudentProfile,
  STUDENT_PROFILE_FIELDS,
} from "@/lib/family/student-profile";
import type { FamilyFormState } from "./family";

export async function updateStudentAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  /*
   * null means the form never posted the field; "" means the parent emptied the
   * box. parseStudentProfile() treats those differently, so the two have to stay
   * distinguishable all the way from the request.
   */
  const raw = Object.fromEntries(
    STUDENT_PROFILE_FIELDS.map((key) => {
      const value = formData.get(key);
      return [key, value === null ? undefined : String(value)];
    })
  );

  const parsed = parseStudentProfile(raw);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const patch: Record<string, unknown> = { ...parsed.values };

  /*
   * The photo used to be set here as well, from a file picker on this form, and
   * it wrote the same column as the headshot on the audition page — so whichever
   * screen saved last won and neither said so (Tony, 3 Sep 2026: "yes remove
   * the profile photo upload too").
   *
   * This action no longer reads headshotDataUrl at all. Ignoring it rather than
   * merely dropping the field from the form is the point: a stale tab posting
   * the old shape must not overwrite the link.
   */

  await getProvider().updateStudent(user.id, studentId, patch);
  revalidatePath(`/family/students/${studentId}`);
  revalidatePath("/family");
  revalidatePath("/family/edit");
  return { ok: true };
}
const hopesSchema = z.object({
  seasonId: z.string().min(1),
  author: z.enum(["parent", "student"]),
  text: z.string().min(1, "Write a sentence or two").max(2000),
  visibleToStudent: z.boolean(),
});

export async function saveHopesAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = hopesSchema.safeParse({
    seasonId: formData.get("seasonId"),
    author: formData.get("author"),
    text: formData.get("text"),
    visibleToStudent: formData.get("visibleToStudent") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  await getProvider().upsertHopes(user.id, studentId, parsed.data);
  revalidatePath(`/family/students/${studentId}`);
  return { ok: true };
}

const showHistorySchema = z.object({
  productionTitle: z.string().min(1, "Show title is required"),
  role: z.string().min(1, "Role is required"),
  year: z.string().regex(/^\d{4}$/, "Four-digit year"),
  organization: z.string().max(120).optional(),
  director: z.string().max(120).optional(),
  venue: z.string().max(120).optional(),
});

export async function addShowHistoryAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = showHistorySchema.safeParse({
    productionTitle: formData.get("productionTitle"),
    role: formData.get("role"),
    year: formData.get("year"),
    organization: formData.get("organization") || undefined,
    director: formData.get("director") || undefined,
    venue: formData.get("venue") || undefined,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  await getProvider().addShowHistoryEntry(user.id, studentId, {
    ...parsed.data,
    seasonName: parsed.data.year,
  });
  revalidatePath(`/family/students/${studentId}`);
  return { ok: true };
}
