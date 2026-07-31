"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Ticket, X } from "lucide-react";
import { org } from "@/config/org";
import { FAMILY_SECTIONS, STAFF_SECTIONS } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { ExternalLinkButton } from "@/components/external-link-button";

/**
 * The hamburger menu carries EVERY section of the app — same source list
 * as the dashboard grid — so nothing is reachable in one place but not the
 * other. Grouped, scrollable, closes on selection.
 */
export function MoreMenu({ isStaff }: { isStaff: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the sheet is open.
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Menu"
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
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-card shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-lg font-semibold">Menu</h2>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu">
                <X aria-hidden />
              </Button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2">
              <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                For families
              </p>
              {FAMILY_SECTIONS.map((section) => (
                <Link
                  key={section.href}
                  href={section.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 hover:bg-accent"
                >
                  <span aria-hidden className="w-6 text-center">
                    {section.emoji}
                  </span>
                  <span className="text-sm font-medium">{section.label}</span>
                </Link>
              ))}

              {isStaff && (
                <>
                  <p className="px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Staff &amp; admin
                  </p>
                  {STAFF_SECTIONS.map((section) => (
                    <Link
                      key={section.href}
                      href={section.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1 hover:bg-accent"
                    >
                      <span aria-hidden className="w-6 text-center">
                        {section.emoji}
                      </span>
                      <span className="text-sm font-medium">{section.label}</span>
                    </Link>
                  ))}
                </>
              )}
            </nav>

            <div className="flex flex-col gap-2 border-t p-4">
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
