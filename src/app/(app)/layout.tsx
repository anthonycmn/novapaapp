import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";
import { getProvider } from "@/lib/api";
import { AppShell } from "@/components/app-shell/app-shell";
import { Spot } from "@/components/spot/spot";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { currentImpersonation } from "@/lib/auth/impersonation";
import { getNavAlerts } from "@/lib/nav-alerts";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PushSync } from "@/components/pwa/push-sync";
import { SignOutButton } from "@/components/app-shell/sign-out-button";

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
  /* A mark beside every menu item with something waiting behind it — unread
     notifications, and forms that are not finished. The second kind stays put
     until the form is signed rather than until the page is visited. */
  const navAlerts = await getNavAlerts(user);
  /* Hub 0063. Null for every real parent, which is all but a handful of
     sessions ever — the cost of asking is one signed-cookie check, cached for
     the request and shared with the guards. */
  const impersonation = await currentImpersonation();

  return (
    <AppShell
      displayName={user.displayName}
      roleLabel={user.family?.name ?? ROLE_LABEL[user.role] ?? user.role}
      unreadCount={unreadCount}
      navAlerts={navAlerts}
      signOutSlot={
        /* The client wrapper purges the service worker's page cache and the
           push subscription before the cookie goes — see SignOutButton. */
        <SignOutButton action={signOut} />
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
      {/* Tony, 2026-09-05, reversing 2026-08-15: the portal now asks to go
          on the home screen — push on iPhone only works installed. Signed-in
          pages only: a login screen nagging to be installed is noise. */}
      <InstallPrompt />
      <PushSync />
    </AppShell>
  );
}
