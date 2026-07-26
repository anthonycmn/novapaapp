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

/**
 * Add-to-home-screen prompt. Shows a small banner when the browser fires
 * `beforeinstallprompt` (Chrome/Edge/Android). iOS Safari never fires it,
 * so we show a one-time hint with the share-sheet instructions instead.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
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
      localStorage.setItem(DISMISSED_KEY, "1");
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
    <Card className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md shadow-lg">
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
