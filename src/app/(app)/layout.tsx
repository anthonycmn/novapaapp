import Link from "next/link";
import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { Bell } from "lucide-react";
import { getProvider } from "@/lib/api";
import { Logo } from "@/components/brand/logo";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { MoreMenu } from "@/components/app-shell/more-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

/**
 * Authenticated app shell: slim top bar + bottom tab navigation.
 * Everything inside the (app) route group requires a session.
 */
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const unreadCount = await getProvider().getUnreadNotificationCount(user.id);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      {/* Keyboard users shouldn't have to tab through the header on every
          page to reach content (WCAG 2.4.1). */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <Logo size={30} />
          <span className="font-display tracking-wide">{org.shortName}</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
            className="relative inline-flex size-11 items-center justify-center rounded-lg hover:bg-accent"
          >
            <Bell aria-hidden className="size-5" />
            {unreadCount > 0 && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-4 text-primary-foreground"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>
          <ThemeToggle />
          <MoreMenu isStaff={hasRoleAtLeast(user, "staff")} />
          <form action={signOut}>
            {/* Default size, not sm: the header is thumb territory and a
                36px control is below the 44px minimum tap target. */}
            <Button variant="ghost" type="submit" className="px-3">
              Sign out
            </Button>
          </form>
          <Avatar name={user.displayName} className="size-8 text-xs" />
        </div>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 px-4 pb-24 pt-4">
        {children}
      </main>

      <BottomNav />
      {/* No InstallPrompt: parents live in a parent PORTAL, not an app
          (Tony, 2026-08-15). Installing still works for anyone who wants
          it; we just stopped asking. */}
    </div>
  );
}
