"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "novapa-install-dismissed";
/* A dismiss is "not now", not "never": on iOS, installing is the only path
   to push notifications, and the old forever-dismiss meant one accidental ✕
   permanently cut that path off (Sep 5 2026 audit). Re-offer after two weeks. */
const DISMISS_FOR_MS = 14 * 24 * 3600 * 1000;

/**
 * Add-to-home-screen prompt. Shows a small banner when the browser fires
 * `beforeinstallprompt` (Chrome/Edge/Android). iOS Safari never fires it,
 * so we show a hint with the share-sheet instructions instead.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
      // "1" from the forever era parses as an ancient timestamp, so those
      // earlier dismissals re-offer immediately — which is the fix, not a bug.
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_FOR_MS) return;
    } catch {
      return;
    }

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // iOS Safari: no beforeinstallprompt; show manual instructions when
    // not already installed.
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error — iOS-only property
      window.navigator.standalone === true;
    if (isIos && !isStandalone) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setDeferred(null);
    setShowIosHint(false);
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  if (!deferred && !showIosHint) return null;

  return (
    // bottom-4: the old bottom-20 was clearance for a tab bar the layout
    // removed on Aug 16.
    <Card className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md shadow-lg">
      <CardContent className="flex items-center gap-3 p-4">
        <span aria-hidden className="text-2xl">🎭</span>
        <div className="min-w-0 flex-1 text-sm">
          {deferred ? (
            <p>Add NOVA PA to your home screen for one-tap access.</p>
          ) : (
            <p>
              Install this app: tap <span className="font-semibold">Share</span> then{" "}
              <span className="font-semibold">Add to Home Screen</span>.
            </p>
          )}
        </div>
        {deferred && (
          <Button size="sm" onClick={install}>
            Install
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={dismiss} aria-label="Dismiss install prompt">
          <X aria-hidden />
        </Button>
      </CardContent>
    </Card>
  );
}
