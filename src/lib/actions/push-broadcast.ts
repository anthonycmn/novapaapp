"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";
import { drainPushQueueUntilDone } from "@/lib/push/queue";

/**
 * A push notification to every parent, from /admin/push.
 *
 * CJ's instruction, 8 Oct 2026: "in the parent portal, allow me to send a
 * push notification to all of the parents."
 *
 * Push here is never a separate channel: the send writes one notification
 * row per parent (the bell, for everyone) and then drains the push outbox
 * straight away, so every device that turned push on rings now rather than
 * at the next 5-minute tick. Per-type opt-outs and quiet hours still hold —
 * a family that switched announcements off asked not to be told.
 *
 * Admins only: a send that reaches every family is not a staff-level button.
 */

export type PushBroadcastState = {
  ok: boolean;
  message?: string;
  errors?: { title?: string; body?: string; url?: string };
};

const TITLE_MAX = 80;
const BODY_MAX = 300;

export async function sendPushToAllParentsAction(
  _prev: PushBroadcastState,
  formData: FormData
): Promise<PushBroadcastState> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "admin")) {
    return { ok: false, message: "Only an admin can send to every family." };
  }

  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const urgent = formData.get("urgent") === "on";

  const errors: PushBroadcastState["errors"] = {};
  if (!title) errors.title = "Give it a title.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if (!body) errors.body = "Say what you want families to know.";
  else if (body.length > BODY_MAX) errors.body = `Keep it under ${BODY_MAX} characters - phones cut the rest.`;
  // A portal page only; a push that opens some other site reads as spam.
  if (url && !/^\/[^/]/.test(url) && url !== "/") {
    errors.url = "Use a portal page, like /schedule or /feed.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  /* broadcast is the dashboard's red band — closures and cancellations
     only (types.ts). Everything else is an announcement. */
  const { recipients } = await getProvider().broadcastNotification(user.id, {
    type: urgent ? "broadcast" : "announcement",
    title,
    body,
    url: url || undefined,
    audience: {},
  });

  let rang = 0;
  let held = 0;
  try {
    const drained = await drainPushQueueUntilDone();
    rang = drained.sent;
    held = drained.deferred;
  } catch (err) {
    // The rows are written; the 5-minute cron will ring whatever this missed.
    console.error("push broadcast drain failed", err);
  }

  await logActivity({
    user,
    action: "push.broadcast",
    summary: `Sent "${title}" to ${recipients} parents${urgent ? " (urgent)" : ""}`,
  });
  revalidatePath("/admin/push");

  const parts = [`Sent to ${recipients} parents' notification bells.`];
  parts.push(`${rang} ${rang === 1 ? "phone or computer" : "phones and computers"} rang.`);
  if (held) parts.push(`${held} held for quiet hours - they ring in the morning.`);
  return { ok: true, message: parts.join(" ") };
}
