"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getStorageProvider } from "@/lib/api/storage";
import type { FeedCategory, PostAttachment, ReactionKind } from "@/lib/api/types";
import { logActivity } from "@/lib/activity";
import { kickPushQueue } from "@/lib/push/queue";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

export async function reactAction(postId: string, kind: ReactionKind): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().reactToPost(user.id, postId, kind);
  await logActivity({
    user,
    action: "feed.reacted",
    summary: `Reacted to an announcement (${kind})`,
    detail: { postId },
  });
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
  await logActivity({
    user,
    action: "feed.question_asked",
    summary: "Asked a private question on an announcement",
    detail: { postId, question },
  });
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
  /* The parent who asked gets their answer's buzz now (hub 0068). */
  await kickPushQueue();
  revalidatePath("/feed");
  revalidatePath("/admin/questions");
  return { ok: true };
}

/**
 * What the composer sends for each attachment (hub 0076).
 *
 * A FILE arrives as the storage PATH the signing route handed out, never as a
 * URL: the address is rebuilt here from the path, so the client cannot record
 * an address that is not ours against a post six hundred families will tap.
 * A LINK is a URL by nature and is taken as one, http(s) only.
 */
const attachmentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    name: z.string().trim().min(1).max(200),
    path: z.string().regex(/^feed\/\d{4}\/[\w.\-]+$/, "Not a path we issued"),
    mime: z.string().max(120).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
  }),
  z.object({
    kind: z.literal("link"),
    name: z.string().trim().min(1).max(200),
    url: z.string().url().regex(/^https?:\/\//i, "Links must start with http:// or https://"),
  }),
]);

const postSchema = z.object({
  title: z.string().max(150).optional(),
  body: z.string().min(1, "Write the announcement").max(10_000),
  category: z.enum(["casting", "rehearsal", "fundraising", "show_week", "celebration", "general"]),
  productionId: z.string().optional(),
  isPinned: z.boolean(),
  linkUrl: z.string().url("Enter a full URL").optional().or(z.literal("")),
  attachments: z.array(attachmentSchema).max(12, "Twelve attachments is plenty for one post"),
});

function parseAttachments(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return "not json";
  }
}

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
    attachments: parseAttachments(formData.get("attachments")),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const { productionId, linkUrl, attachments: picked, ...rest } = parsed.data;
  const storage = getStorageProvider();
  const attachments: PostAttachment[] = picked.map((a) =>
    a.kind === "file"
      ? {
          kind: "file",
          name: a.name,
          url: storage.publicUrlFor("feed-attachments", a.path),
          mime: a.mime,
          sizeBytes: a.sizeBytes,
        }
      : { kind: "link", name: a.name, url: a.url }
  );
  await getProvider().createFeedPost(user.id, {
    ...rest,
    category: rest.category as FeedCategory,
    linkUrl: linkUrl || undefined,
    attachments,
    audience: productionId ? { productionIds: [productionId] } : {},
  });
  /* An announcement's whole point is being seen; ring it now (hub 0068). */
  await kickPushQueue();
  revalidatePath("/feed");
  return { ok: true };
}
