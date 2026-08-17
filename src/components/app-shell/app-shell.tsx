"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell, Menu } from "lucide-react";
import { Wordmark } from "@/components/brand/logo";
import { Sidebar } from "@/components/app-shell/sidebar";

/**
 * The staff portal's shell, for families: a fixed sidebar from `lg` up, and
 * on a phone the same sidebar as a drawer behind a hamburger, with a compact
 * top bar carrying the wordmark and the notification bell.
 *
 * Tony, 2026-08-16: "match everything in the staff portal including layout."
 * That replaced the bottom tab bar — see the note in the layout file.
 */
export function AppShell({
  displayName,
  roleLabel,
  isStaff,
  unreadCount,
  signOutSlot,
  children,
}: {
  displayName: string;
  roleLabel: string;
  isStaff: boolean;
  unreadCount: number;
  signOutSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Any navigation closes the drawer — otherwise it stays over the page you
  // just asked for.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const sidebar = (
    <Sidebar
      displayName={displayName}
      roleLabel={roleLabel}
      isStaff={isStaff}
      onNavigate={() => setOpen(false)}
      signOutSlot={signOutSlot}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>

      <div className="hidden lg:block">{sidebar}</div>

      {open && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div className="relative" role="dialog" aria-modal="true" aria-label="Navigation">
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b bg-card px-4 py-2.5 lg:hidden">
          <button
            onClick={() => setOpen(true)}
            aria-label="Menu"
            aria-expanded={open}
            className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Menu aria-hidden size={18} />
          </button>
          {/* On a phone the top bar IS the top-left corner, so it carries the
              same wordmark as the desktop rail rather than a second treatment. */}
          <Link href="/dashboard" className="flex min-w-0 items-center">
            <Wordmark size={24} />
          </Link>
          <Link
            href="/notifications"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            className="relative ml-auto inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Bell aria-hidden size={18} />
            {unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-background px-4 py-5 sm:px-6"
        >
          <div className="mx-auto max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
