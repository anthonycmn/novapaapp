"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { broadcastPushToAllParents, cleanAudience } from "@/lib/push/broadcast";

/**
 * A push notification to every parent, from /admin/push.
 *
 * CJ's instruction, 8 Oct 2026: "in the parent portal, allow me to send a
 * push notification to all of the parents." The send itself lives in
 * lib/push/broadcast.ts, shared with the staff portal's door.
 */

/** The composer's picks, as JSON in a hidden field. Unreadable = nobody picked. */
function audienceFrom(formData: FormData) {
  try {
    return cleanAudience(JSON.parse(String(formData.get("audience") ?? "{}")));
  } catch {
    return {};
  }
}

export type PushBroadcastState = {
  ok: boolean;
  message?: string;
  errors?: { title?: string; body?: string; url?: string };
};

export async function sendPushToAllParentsAction(
  _prev: PushBroadcastState,
  formData: FormData
): Promise<PushBroadcastState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) {
    return { ok: false, message: "Only an admin can send to every family." };
  }

  const result = await broadcastPushToAllParents(user, {
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    url: String(formData.get("url") ?? ""),
    urgent: formData.get("urgent") === "on",
    audience: audienceFrom(formData),
  });
  if (!result.ok) return result;

  revalidatePath("/admin/push");
  return { ok: true, message: result.message };
}
