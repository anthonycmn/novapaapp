"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import type { FeedCategory, ReactionKind } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

export async function reactAction(postId: string, kind: ReactionKind): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().reactToPost(user.id, postId, kind);
  revalidatePath("/feed");
}

export async function askQuestionAction(
  postId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };
  const question = String(formData.get("question") ?? "").trim();
  if (!question) return { ok: false, errors: { question: "Type your question first" } };
  if (question.length > 1000) {
    return { ok: false, errors: { question: "Keep it under 1000 characters" } };
  }
  await getProvider().askQuestion(user.id, postId, question);
  revalidatePath("/feed");
  return { ok: true };
}

export async function answerQuestionAction(
  questionId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) return { ok: false, errors: { answer: "Write an answer first" } };
  const publishAsFaq = formData.get("publishAsFaq") === "on";
  await getProvider().answerQuestion(user.id, questionId, answer, publishAsFaq);
  revalidatePath("/feed");
  revalidatePath("/admin/questions");
  return { ok: true };
}

const postSchema = z.object({
  title: z.string().max(150).optional(),
  body: z.string().min(1, "Write the announcement").max(10_000),
  category: z.enum(["casting", "rehearsal", "fundraising", "show_week", "celebration", "general"]),
  productionId: z.string().optional(),
  isPinned: z.boolean(),
  linkUrl: z.string().url("Enter a full URL").optional().or(z.literal("")),
});

export async function createPostAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }

  const parsed = postSchema.safeParse({
    title: formData.get("title") || undefined,
    body: formData.get("body"),
    category: formData.get("category"),
    productionId: formData.get("productionId") || undefined,
    isPinned: formData.get("isPinned") === "on",
    linkUrl: formData.get("linkUrl") || "",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const { productionId, linkUrl, ...rest } = parsed.data;
  await getProvider().createFeedPost(user.id, {
    ...rest,
    category: rest.category as FeedCategory,
    linkUrl: linkUrl || undefined,
    audience: productionId ? { productionIds: [productionId] } : {},
  });
  revalidatePath("/feed");
  return { ok: true };
}
