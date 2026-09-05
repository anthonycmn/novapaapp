"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { MAX_REFERENCE_PHOTOS, MIN_REFERENCE_PHOTOS } from "@/lib/api/photos/types";
import { logActivity } from "@/lib/activity";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runIngestAndMatch } from "@/lib/jobs/photo-matching";
import type { FamilyFormState } from "./family";

const consentSchema = z.object({
  understood: z.literal(true, {
    errorMap: () => ({ message: "Please confirm you've read how this works" }),
  }),
  photos: z
    .array(z.string().min(1))
    .min(MIN_REFERENCE_PHOTOS, `Upload at least ${MIN_REFERENCE_PHOTOS} photos`)
    .max(MAX_REFERENCE_PHOTOS, `Upload at most ${MAX_REFERENCE_PHOTOS} photos`),
});

export async function grantConsentAction(
  studentId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = consentSchema.safeParse({
    understood: formData.get("understood") === "on",
    photos: formData.getAll("photos").map(String).filter(Boolean),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  try {
    await getProvider().grantFaceConsent(user.id, studentId, parsed.data.photos);
  } catch (error) {
    return { ok: false, errors: { _form: String(error instanceof Error ? error.message : error) } };
  }

  await logActivity({
    user,
    action: "photos.consent_granted",
    summary: "Granted photo face-matching consent",
    studentId,
    detail: { referencePhotos: parsed.data.photos.length },
  });
  revalidatePath("/photos");
  revalidatePath(`/photos/consent/${studentId}`);
  return { ok: true };
}

export async function revokeConsentAction(studentId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().revokeFaceConsent(user.id, studentId);
  await logActivity({
    user,
    action: "photos.consent_revoked",
    summary: "Revoked photo face-matching consent — face data deleted",
    studentId,
  });
  revalidatePath("/photos");
  revalidatePath(`/photos/consent/${studentId}`);
}

export async function rejectMatchAction(matchId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().rejectMatch(user.id, matchId);
  await logActivity({
    user,
    action: "photos.match_rejected",
    summary: "Said a photo match is not their child",
    detail: { matchId },
  });
  revalidatePath("/photos");
}

export async function confirmMatchAction(matchId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().confirmMatch(user.id, matchId);
  await logActivity({
    user,
    action: "photos.match_confirmed",
    summary: "Confirmed a photo match of their child",
    detail: { matchId },
  });
  revalidatePath("/photos");
}

/**
 * Kicks the ingest job. Staff only. Deliberately awaited here because it is
 * an explicit admin action with a result to report — page renders never
 * call this.
 */
export async function runIngestAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await runIngestAndMatch(user.id);
  revalidatePath("/admin/photos");
  revalidatePath("/photos");
}
