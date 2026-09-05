"use client";

import { LogOut } from "lucide-react";

/**
 * Sign out, and take the device with you.
 *
 * The server action only clears the cookie. On a shared family iPad that
 * left two things behind (Sep 5 2026 audit): the service worker's cached
 * navigations — the previous user's rendered pages, children and schedule,
 * servable offline to the next person — and the push subscription, which
 * kept ringing for an account nobody was signed into. Both are torn down
 * here, best-effort, before the action runs; a failure in either must never
 * block the sign-out itself.
 */
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  async function handleSubmit() {
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "clear-shell-cache" });
      const registration = await navigator.serviceWorker?.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    } catch {
      // Best-effort only — signing out still proceeds.
    }
    await action();
  }

  return (
    <form action={handleSubmit}>
      <button
        type="submit"
        title="Sign out"
        aria-label="Sign out"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <LogOut aria-hidden size={14} />
      </button>
    </form>
  );
}
