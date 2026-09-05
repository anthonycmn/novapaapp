"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { kickPushQueue } from "@/lib/push/queue";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

/**
 * A family sends one of two shapes: a topic they picked out of the contact
 * tree, or — only when the bridge to the staff portal is down and they were
 * shown the fallback list — one of the two roles. One of the two must be
 * present, because a message addressed to nobody is not a message.
 */
const startSchema = z
  .object({
    topicId: z.string().optional(),
    recipientRole: z.enum(["admin", "health_safety"]).optional(),
    subject: z.string().min(1, "Add a subject").max(150),
    body: z.string().min(1, "Write your message").max(5000),
    studentId: z.string().optional(),
  })
  .refine((input) => Boolean(input.topicId || input.recipientRole), {
    message: "Choose what your message is about",
    path: ["topicId"],
  });

export async function startThreadAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = startSchema.safeParse({
    topicId: String(formData.get("topicId") ?? "") || undefined,
    recipientRole: String(formData.get("recipientRole") ?? "") || undefined,
    subject: formData.get("subject"),
    body: formData.get("body"),
    studentId: String(formData.get("studentId") ?? "") || undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  let threadId: string;
  try {
    const thread = await getProvider().startMessageThread(user.id, parsed.data);
    threadId = thread.id;
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  await logActivity({
    user,
    action: "messages.thread_started",
    summary: `Messaged the office: “${parsed.data.subject}”`,
    studentId: parsed.data.studentId,
    detail: { threadId, topicId: parsed.data.topicId, recipientRole: parsed.data.recipientRole },
  });
  /* The staff being asked should feel the buzz now, not at the next cron
     tick — a new thread wrote its notification rows already (hub 0068). */
  await kickPushQueue();
  revalidatePath("/messages");
  redirect(`/messages/${threadId}`);
}

export async function replyAction(
  threadId: string,
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false, errors: { body: "Write a message first" } };

  try {
    await getProvider().replyToThread(user.id, threadId, body);
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  await logActivity({
    user,
    action: "messages.replied",
    summary: "Replied in a message thread",
    detail: { threadId },
  });
  /* A reply is the push families asked for by name; ring it now. */
  await kickPushQueue();
  revalidatePath(`/messages/${threadId}`);
  revalidatePath(`/admin/messages/${threadId}`);
  return { ok: true };
}

export async function setThreadStatusAction(
  threadId: string,
  status: "open" | "closed"
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await getProvider().setThreadStatus(user.id, threadId, status);
  revalidatePath("/admin/messages");
  revalidatePath(`/admin/messages/${threadId}`);
}
