import Link from "next/link";
import { redirect } from "next/navigation";
import { org } from "@/config/org";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { Bell } from "lucide-react";
import { getProvider } from "@/lib/api";
import { BottomNav } from "@/components/app-shell/bottom-nav";
import { MoreMenu } from "@/components/app-shell/more-menu";
import { InstallPrompt } from "@/components/pwa/install-prompt";
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
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <span aria-hidden>🎭</span>
          <span className="font-display">{org.shortName}</span>
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
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
          <Avatar name={user.displayName} className="size-8 text-xs" />
        </div>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
