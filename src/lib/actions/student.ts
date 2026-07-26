"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

const studentSchema = z.object({
  preferredName: z.string().max(60).optional(),
  pronouns: z.string().max(30).optional(),
  grade: z.string().min(1, "Grade is required"),
  school: z.string().max(120).optional(),
  tshirtSize: z.enum(["YXS", "YS", "YM", "YL", "AS", "AM", "AL", "AXL"]).optional(),
  allergies: z.string().max(500).optional(),
  medicalFlags: z.string().max(500).optional(),
  vocalRange: z.string().max(40).optional(),
  danceExperience: z.string().max(500).optional(),
  auditionSongUrl: z
    .string()
    .url("Enter a full URL (YouTube, Drive, or Dropbox)")
    .optional()
    .or(z.literal("")),
});

export async function updateStudentAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const raw = Object.fromEntries(
    [
      "preferredName",
      "pronouns",
      "grade",
      "school",
      "tshirtSize",
      "allergies",
      "medicalFlags",
      "vocalRange",
      "danceExperience",
      "auditionSongUrl",
    ].map((key) => {
      const value = formData.get(key);
      return [key, value === null || value === "" ? undefined : String(value)];
    })
  );
  // Preserve "" for auditionSongUrl clearing
  if (formData.get("auditionSongUrl") === "") raw.auditionSongUrl = "";

  const parsed = studentSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const patch = { ...parsed.data };
  if (patch.auditionSongUrl === "") patch.auditionSongUrl = undefined;

  await getProvider().updateStudent(user.id, studentId, patch);
  revalidatePath(`/family/students/${studentId}`);
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
