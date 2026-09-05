import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Notification click-through: mark it read, then land the user on the page
 * the notification is about (a casting notification goes straight to
 * /casting, a message reply to the thread, and so on).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSessionUser();
  if (!user) {
    // Keep the destination: a parent tapping a push after their session
    // lapsed should land where the notification pointed, not on the
    // dashboard. Login already honors ?next= for exactly this.
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const { id } = await params;
  const provider = getProvider();
  // Either pile: an office row is followed the same way a family one is.
  const notifications = await provider.getNotifications(user.id, "all");
  const notification = notifications.find((candidate) => candidate.id === id);

  if (notification) {
    await provider.markNotificationRead(user.id, id);
  }

  // Only follow app-internal paths — a stored URL must never become an
  // open redirect.
  const target =
    notification?.url && notification.url.startsWith("/")
      ? notification.url
      : "/notifications";

  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
