"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Ticket, Wrench } from "lucide-react";
import { org } from "@/config/org";
import {
  FAMILY_SECTIONS,
  STAFF_PORTAL_URL,
  groupSections,
} from "@/config/navigation";
import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/**
 * The staff portal's sidebar, for families.
 *
 * The active row is a gold outline and nothing else — same text colour, same
 * weight, same background as every other row. A filled highlight made the
 * current row look like a different *kind* of thing rather than the current
 * one. The border is always present and only changes colour, so nothing
 * shifts by a pixel when a row becomes active. (Both rules lifted straight
 * from the staff portal's Layout.tsx, deliberately.)
 */
export function Sidebar({
  displayName,
  roleLabel,
  isStaff,
  onNavigate,
  signOutSlot,
}: {
  displayName: string;
  roleLabel: string;
  isStaff: boolean;
  /** Mobile drawer closes itself on selection; the desktop rail passes nothing. */
  onNavigate?: () => void;
  signOutSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  /*
   * Families only. Tony, 17 Aug 2026: "there shouldn't be any staff page stuff
   * on the left hand side navigation."
   *
   * This is a parent's portal, and a Staff group in the sidebar — even one
   * only staff could see — made it read as two products sharing a menu. Staff
   * still author their bio here, because the staff portal's Bio approvals has
   * no other source, but they reach it from Our staff, where they are already
   * looking at profiles, rather than from a section of their own.
   */
  const groups = groupSections(FAMILY_SECTIONS);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-60 shrink-0 flex-col border-r bg-card"
    >
      <div className="flex items-center border-b px-3 py-3">
        <Wordmark size={28} />
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "mb-0.5 flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-[13px] transition-colors",
            isActive("/dashboard")
              ? "border-gold text-foreground"
              : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
          aria-current={isActive("/dashboard") ? "page" : undefined}
        >
          <LayoutDashboard aria-hidden size={15} className="shrink-0" />
          <span className="flex-1 truncate">Dashboard</span>
        </Link>

        {groups.map(([group, sections]) => (
          <div key={group} className="mt-3">
            <div className="mb-1 px-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">
              {group}
            </div>
            {sections.map(({ href, label, Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "mb-0.5 flex items-center gap-2.5 rounded-md border px-2 py-1.5 text-[13px] transition-colors",
                    active
                      ? "border-gold text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon aria-hidden size={15} className="shrink-0" />
                  <span className="flex-1 truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="border-t p-2">
        {/* Staff work happens in the staff portal now — one door, not a
            second copy of every tool (Tony, 16 Aug 2026). */}
        {isStaff && (
          <a
            href={STAFF_PORTAL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-1 flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Wrench aria-hidden size={15} className="shrink-0" />
            <span className="flex-1 truncate">Staff portal</span>
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}

        <a
          href={org.ticketsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-1 flex items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Ticket aria-hidden size={15} className="shrink-0" />
          <span className="flex-1 truncate">Buy tickets</span>
          <span className="sr-only">(opens in a new tab)</span>
        </a>

        <div className="flex items-center justify-between px-2 pb-1.5">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">
            Theme
          </span>
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
          <Avatar name={displayName} className="size-[26px] text-[10px]" />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[12.5px] font-medium">{displayName}</div>
            <div className="truncate text-[11px] text-muted-foreground">{roleLabel}</div>
          </div>
          {signOutSlot}
        </div>
      </div>
    </nav>
  );
}
