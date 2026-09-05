"use server";

import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { getSessionUser } from "@/lib/auth/session";
import { logActivity } from "@/lib/activity";

/**
 * A device raises or lowers its hand for push (hub 0068).
 *
 * The subscription itself is minted in the browser (lib/platform/push.ts);
 * these actions only file it. The endpoint is the identity: one row per
 * device, and a device that re-subscribes — or changes hands to another
 * signed-in account on a shared iPad — updates its row rather than
 * multiplying it.
 */

function pushConfigured(): boolean {
  return (
    (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase" && isSupabaseConfigured()
  );
}

export async function savePushSubscriptionAction(
  subscription: PushSubscriptionJSON
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !pushConfigured()) return { ok: false };
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!endpoint || !p256dh || !auth) return { ok: false };

  const { error } = await getServiceClient()
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, keys: { p256dh, auth } },
      { onConflict: "endpoint" }
    );
  if (error) {
    console.error("push subscription save failed", error.message);
    return { ok: false };
  }
  await logActivity({
    user,
    action: "push.enabled",
    summary: "Turned on push notifications on a device",
  });
  return { ok: true };
}

export async function removePushSubscriptionAction(
  endpoint: string
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user || !pushConfigured() || !endpoint) return { ok: false };

  /* Scoped to the caller's own rows: an endpoint is unguessable, but there
     is no reason to let one account delete another's device anyway. */
  const { error } = await getServiceClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);
  if (error) {
    console.error("push subscription removal failed", error.message);
    return { ok: false };
  }
  await logActivity({
    user,
    action: "push.disabled",
    summary: "Turned off push notifications on a device",
  });
  return { ok: true };
}

/**
 * Silent freshness sync on app load: the browser already holds a granted
 * subscription, and the server row should match it — covering endpoint
 * rotation and the account currently signed in on this device. No activity
 * line: nothing was decided, only kept true.
 */
export async function syncPushSubscriptionAction(
  subscription: PushSubscriptionJSON
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !pushConfigured()) return;
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!endpoint || !p256dh || !auth) return;
  await getServiceClient()
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, keys: { p256dh, auth } },
      { onConflict: "endpoint" }
    );
}
