import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { getSessionUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { getProvider } from "@/lib/api";
import { AppShell } from "@/components/app-shell/app-shell";
import { Spot } from "@/components/spot/spot";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { currentImpersonation } from "@/lib/auth/impersonation";

/**
 * Authenticated app shell. Everything inside the (app) route group requires
 * a session.
 *
 * Tony, 2026-08-16: "match everything in the staff portal including layout."
 * So this is the staff portal's shell — a sidebar from `lg` up, a hamburger
 * drawer below it — and the bottom tab bar is gone, because the staff portal
 * does not have one. Worth knowing if it ever comes back: a bottom bar is the
 * better pattern for 769 families on phones, and BottomNav still exists in
 * src/components/app-shell/bottom-nav.tsx, unreferenced, for exactly that.
 */
const ROLE_LABEL: Record<string, string> = {
  parent: "Parent",
  student: "Student",
  staff: "Staff",
  admin: "Admin",
  super_admin: "Super Admin",
};

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const unreadCount = await getProvider().getUnreadNotificationCount(user.id);
  /* Hub 0063. Null for every real parent, which is all but a handful of
     sessions ever — the cost of asking is one signed-cookie check, cached for
     the request and shared with the guards. */
  const impersonation = await currentImpersonation();

  return (
    <AppShell
      displayName={user.displayName}
      roleLabel={user.family?.name ?? ROLE_LABEL[user.role] ?? user.role}
      unreadCount={unreadCount}
      signOutSlot={
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut aria-hidden size={14} />
          </button>
        </form>
      }
    >
      {/* Above the page, not inside it, so it survives every route in the
          group and cannot be scrolled away from. */}
      {impersonation && (
        <ImpersonationBanner
          who={`${user.displayName}${user.family?.name ? ` — ${user.family.name}` : ""}`}
          actorEmail={impersonation.actorEmail}
        />
      )}
      {children}
      {/* Spot rides along on every signed-in page: a parent who cannot find
          something is, by definition, not on the page that would explain it.
          It costs nothing to run — everything it knows ships in the bundle
          and is matched in the browser. */}
      <Spot />
    </AppShell>
  );
}
