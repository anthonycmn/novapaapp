"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

const score = z.coerce.number().int().min(1, "Pick a rating").max(5);

const reviewSchema = z.object({
  windowId: z.string().min(1),
  instructionQuality: score,
  communication: score,
  childGrowth: score,
  organization: score,
  comment: z.string().max(4000),
  isAnonymous: z.boolean(),
});

export async function submitReviewAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = reviewSchema.safeParse({
    windowId: formData.get("windowId"),
    instructionQuality: formData.get("instructionQuality"),
    communication: formData.get("communication"),
    childGrowth: formData.get("childGrowth"),
    organization: formData.get("organization"),
    comment: String(formData.get("comment") ?? ""),
    isAnonymous: formData.get("isAnonymous") === "on",
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const { windowId, comment, isAnonymous, ...scores } = parsed.data;

  try {
    await getProvider().submitReview(user.id, {
      windowId,
      comment,
      isAnonymous,
      scores,
    });
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  // The Chief-only page may name the reviewer — the app's standing rule is
  // that admins see everything, including who wrote an anonymous review —
  // but the line says the anonymity out loud so nobody quotes a name back.
  await logActivity({
    user,
    action: "reviews.submitted",
    summary: `Left a private review${isAnonymous ? " (marked anonymous)" : ""}`,
    detail: { windowId },
  });
  revalidatePath("/reviews");
  return { ok: true };
}

export async function flagReviewAction(reviewId: string, formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) return;
  const reason = String(formData.get("reason") ?? "").trim() || "Needs follow-up";
  await getProvider().flagReview(user.id, reviewId, reason);
  revalidatePath("/admin/reviews");
}

export async function resolveReviewAction(reviewId: string, formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) return;
  const note = String(formData.get("note") ?? "").trim() || "Resolved";
  await getProvider().resolveReview(user.id, reviewId, note);
  revalidatePath("/admin/reviews");
}
