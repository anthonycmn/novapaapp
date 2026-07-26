"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, Ticket, X } from "lucide-react";
import { org } from "@/config/org";
import { Button } from "@/components/ui/button";
import { ExternalLinkButton } from "@/components/external-link-button";

const LINKS = [
  { href: "/store", label: "Spirit buttons", emoji: "🎟️" },
  { href: "/productions", label: "Productions", emoji: "🎭" },
  { href: "/staff", label: "Our staff", emoji: "👋" },
  { href: "/reviews", label: "Give feedback", emoji: "⭐" },
  { href: "/family/pickup", label: "Drop-off & pick-up", emoji: "🚗" },
  { href: "/notifications/settings", label: "Notification settings", emoji: "🔔" },
];

const STAFF_LINKS = [
  { href: "/admin", label: "Staff tools", emoji: "🛠️" },
  { href: "/staff/feedback", label: "My feedback", emoji: "⭐" },
];

/**
 * Overflow navigation. Tickets and the main website live here and on the
 * dashboard, so they're always one tap away (#12, #13).
 */
export function MoreMenu({ isStaff }: { isStaff: boolean }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="More"
        aria-expanded={open}
      >
        <Menu aria-hidden />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">More</h2>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
                <X aria-hidden />
              </Button>
            </div>

            <nav className="flex flex-col">
              {[...LINKS, ...(isStaff ? STAFF_LINKS : [])].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-accent"
                >
                  <span aria-hidden>{link.emoji}</span>
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 flex flex-col gap-2 border-t pt-4">
              <ExternalLinkButton href={org.ticketsUrl}>
                <Ticket aria-hidden className="size-4" />
                Buy tickets on BookTix
              </ExternalLinkButton>
              <ExternalLinkButton href={org.websiteUrl} variant="outline">
                {org.shortName} website
              </ExternalLinkButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
