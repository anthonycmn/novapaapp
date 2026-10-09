import "server-only";
import { getProvider } from "@/lib/api";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import type { SessionUser } from "@/lib/api/types";
import { logActivity } from "@/lib/activity";
import { hasRoleAtLeast } from "@/lib/auth/session";
import { drainPushQueueUntilDone } from "@/lib/push/queue";

/**
 * A push notification to every parent — the one send behind both doors:
 * the hub's own /admin/push and the staff portal's "Push to parents" page
 * (via /api/push/broadcast, CJ 9 Oct 2026: "I want to push the notification
 * from the staff portal to the parent portal").
 *
 * Push here is never a separate channel: the send writes one notification
 * row per parent (the bell, for everyone) and then drains the push outbox
 * straight away, so every device that turned push on rings now rather than
 * at the next 5-minute tick. Per-type opt-outs and quiet hours still hold —
 * a family that switched announcements off asked not to be told.
 *
 * Admins only: a send that reaches every family is not a staff-level button.
 * Callers check the role; this re-checks it so neither door can forget.
 */

export const TITLE_MAX = 80;
export const BODY_MAX = 300;

export type PushBroadcastInput = {
  title: string;
  body: string;
  url?: string;
  urgent?: boolean;
};

export type PushBroadcastResult =
  | { ok: true; recipients: number; rang: number; held: number; message: string }
  | { ok: false; message?: string; errors?: { title?: string; body?: string; url?: string } };

/**
 * The two honest numbers: every parent sees the notice in their bell, but
 * only parents who turned push on for a device get a phone that rings.
 * Saying "sent to 823" and nothing else would let CJ believe 823 phones lit up.
 */
export async function pushReach(): Promise<{ parents: number; devices: number; parentsWithPush: number } | null> {
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase" || !isSupabaseConfigured()) {
    return null;
  }
  const db = getServiceClient();
  const [{ data: parents }, { data: subs }] = await Promise.all([
    db.from("profiles").select("id").eq("role", "parent"),
    db.from("push_subscriptions").select("user_id"),
  ]);
  const parentIds = new Set((parents ?? []).map((p: { id: string }) => p.id));
  const parentSubs = (subs ?? []).filter((s: { user_id: string }) => parentIds.has(s.user_id));
  return {
    parents: parentIds.size,
    devices: parentSubs.length,
    parentsWithPush: new Set(parentSubs.map((s: { user_id: string }) => s.user_id)).size,
  };
}

export async function broadcastPushToAllParents(
  user: SessionUser,
  input: PushBroadcastInput
): Promise<PushBroadcastResult> {
  if (!hasRoleAtLeast(user, "admin")) {
    return { ok: false, message: "Only an admin can send to every family." };
  }

  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  const url = (input.url ?? "").trim();
  const urgent = input.urgent === true;

  const errors: { title?: string; body?: string; url?: string } = {};
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

  const parts = [`Sent to ${recipients} parents' notification bells.`];
  parts.push(`${rang} ${rang === 1 ? "phone or computer" : "phones and computers"} rang.`);
  if (held) parts.push(`${held} held for quiet hours - they ring in the morning.`);
  return { ok: true, recipients, rang, held, message: parts.join(" ") };
}
