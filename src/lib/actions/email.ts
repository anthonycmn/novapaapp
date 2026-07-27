"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getEmailDeliveryProvider, resolveMergeFields } from "@/lib/api/email";
import { instrumentEmailBody } from "@/lib/api/email/tracking";
import type { EmailCategory } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

const emailSchema = z.object({
  templateId: z.string().optional(),
  subject: z.string().min(1, "Subject is required").max(200),
  body: z.string().min(1, "Body is required").max(50_000),
  category: z.enum(["critical", "casting", "payment", "newsletter", "fundraising"]),
  productionId: z.string().optional(),
  scheduledFor: z.string().optional(),
  mode: z.enum(["send", "test"]),
});

export async function sendEmailAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState & { sentCount?: number }> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return { ok: false, errors: { _form: "Staff only" } };
  }

  const parsed = emailSchema.safeParse({
    templateId: formData.get("templateId") || undefined,
    subject: formData.get("subject"),
    body: formData.get("body"),
    category: formData.get("category"),
    productionId: formData.get("productionId") || undefined,
    scheduledFor: formData.get("scheduledFor") || undefined,
    mode: formData.get("mode"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const { productionId, mode, scheduledFor, ...rest } = parsed.data;
  const provider = getProvider();
  const audience = productionId ? { productionIds: [productionId] } : {};

  const send = await provider.sendEmail(user.id, {
    ...rest,
    category: rest.category as EmailCategory,
    audience,
    scheduledFor: mode === "send" ? scheduledFor : undefined,
    testToSelf: mode === "test",
  });

  // Deliver through the adapter (mock logs; Resend sends for real).
  const delivery = getEmailDeliveryProvider();
  const recipients =
    mode === "test" ? [user] : await provider.resolveAudience(user.id, audience);
  if (!scheduledFor || mode === "test") {
    const production = productionId ? await provider.getProduction(productionId) : null;
    const headerList = await headers();
    const origin =
      headerList.get("origin") ?? `https://${headerList.get("host") ?? "localhost:3000"}`;

    for (const recipient of recipients) {
      const context = {
        parent_first: recipient.displayName.split(" ")[0],
        sender_name: user.displayName,
        show_title: production?.title,
      };
      // Merge fields first, then instrument — otherwise a merge field that
      // resolves to a URL wouldn't get a tracking wrapper.
      const resolvedBody = resolveMergeFields(send.body, context);
      await delivery.send({
        to: recipient.email,
        subject: resolveMergeFields(send.subject, context),
        text: instrumentEmailBody(
          resolvedBody,
          { sendId: send.id, recipientId: recipient.id },
          origin
        ),
        category: send.category,
      });
    }
  }

  revalidatePath("/admin/email");
  return { ok: true, sentCount: recipients.length };
}
