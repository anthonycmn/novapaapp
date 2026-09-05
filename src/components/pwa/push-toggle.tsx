"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPushPermission, subscribeToPush, unsubscribeFromPush } from "@/lib/platform/push";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/lib/actions/push";

/**
 * The per-device push switch, on the notification settings page.
 *
 * The type toggles above it decide WHAT is worth interrupting for; this
 * decides whether THIS DEVICE may be interrupted at all. One state machine,
 * five states, each with one honest sentence:
 *
 *  - unsupported + iPhone Safari tab → push exists but only for the
 *    installed app, so say exactly that instead of "not supported";
 *  - unsupported elsewhere → say so;
 *  - denied → the browser owns the block, point at its settings;
 *  - subscribed → offer off;
 *  - otherwise → offer on.
 */
type State =
  | "loading"
  | "unsupported"
  | "needs-install"
  | "denied"
  | "subscribed"
  | "unsubscribed";

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    async function detect() {
      const permission = getPushPermission();
      if (permission === "unsupported" || !("PushManager" in window)) {
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const isStandalone =
          window.matchMedia("(display-mode: standalone)").matches ||
          // @ts-expect-error — iOS-only property
          window.navigator.standalone === true;
        setState(isIos && !isStandalone ? "needs-install" : "unsupported");
        return;
      }
      if (permission === "denied") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setState(subscription ? "subscribed" : "unsubscribed");
    }
    detect().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const subscription = await subscribeToPush(
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
      );
      if (!subscription) {
        setState(getPushPermission() === "denied" ? "denied" : "unsubscribed");
        return;
      }
      const { ok } = await savePushSubscriptionAction(subscription);
      setState(ok ? "subscribed" : "unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      const endpoint = subscription?.endpoint;
      await unsubscribeFromPush();
      if (endpoint) await removePushSubscriptionAction(endpoint);
      setState("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BellRing aria-hidden size={16} />
          Push on this device
        </CardTitle>
        <CardDescription>
          Message replies, rehearsal changes, casting news and more, the moment
          they happen — even with the portal closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {state === "loading" && (
          <p className="text-sm text-muted-foreground">Checking this device…</p>
        )}
        {state === "needs-install" && (
          <p className="text-sm text-muted-foreground">
            On iPhone, notifications need the installed app: tap{" "}
            <span className="font-semibold">Share</span>, then{" "}
            <span className="font-semibold">Add to Home Screen</span>, and open
            the portal from there.
          </p>
        )}
        {state === "unsupported" && (
          <p className="text-sm text-muted-foreground">
            This browser can&apos;t receive push notifications.
          </p>
        )}
        {state === "denied" && (
          <p className="text-sm text-muted-foreground">
            Notifications are blocked for this site in your browser settings.
            Allow them there, then come back.
          </p>
        )}
        {state === "unsubscribed" && (
          <Button onClick={enable} disabled={busy}>
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        )}
        {state === "subscribed" && (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">On for this device</p>
            <Button variant="outline" size="sm" onClick={disable} disabled={busy}>
              {busy ? "Turning off…" : "Turn off"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
