"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import type { MessageRecipientRole } from "@/lib/api/messages/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

const startSchema = z.object({
  recipientRole: z.enum(["admin", "health_safety"]),
  subject: z.string().min(1, "Add a subject").max(150),
  body: z.string().min(1, "Write your message").max(5000),
  studentId: z.string().optional(),
});

export async function startThreadAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = startSchema.safeParse({
    recipientRole: formData.get("recipientRole"),
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
    const thread = await getProvider().startMessageThread(user.id, {
      ...parsed.data,
      recipientRole: parsed.data.recipientRole as MessageRecipientRole,
    });
    threadId = thread.id;
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

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
