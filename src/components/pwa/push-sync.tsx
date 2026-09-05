"use client";

import { useEffect } from "react";
import { syncPushSubscriptionAction } from "@/lib/actions/push";

/**
 * Keeps the server's copy of this device's push subscription true.
 *
 * Browsers rotate push endpoints, and a family iPad may be signed into a
 * different account than the one that first subscribed. On each app load,
 * if this device already granted push, whatever subscription it currently
 * holds is re-filed under the signed-in account. Never asks for anything;
 * a device that hasn't opted in stays untouched.
 */
export function PushSync() {
  useEffect(() => {
    async function sync() {
      if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (!subscription) return;
      /* Skip only when THIS endpoint was already filed this session — keyed
         by endpoint, not a boolean, because Chrome rotates endpoints (CJ's
         phone went silently deaf on 5 Sep 2026 when a worker update rotated
         his) and a rotated one must re-file even mid-session. */
      try {
        if (sessionStorage.getItem("novapa-push-synced") === subscription.endpoint) return;
      } catch {
        /* storage blocked — sync anyway */
      }
      await syncPushSubscriptionAction(subscription.toJSON());
      try {
        sessionStorage.setItem("novapa-push-synced", subscription.endpoint);
      } catch {
        /* ignore */
      }
    }
    sync().catch(() => {
      /* best-effort; the settings page is the deliberate path */
    });
  }, []);
  return null;
}
