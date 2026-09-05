import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Where a rotated push subscription re-files itself (hub 0068 follow-up).
 *
 * Chrome rotates subscription endpoints — on service worker updates, and
 * whenever it feels like it. The day it happened to the first real device
 * (CJ's, 5 Sep 2026), the old endpoint answered 410 and the phone went
 * silently deaf: the service worker's `pushsubscriptionchange` fires in the
 * background with NO page open, so a server action can't catch it. This
 * route exists for exactly that moment; the worker POSTs the new
 * subscription (and the endpoint it replaces) with the session cookie
 * riding along.
 *
 * Same shape as the savePushSubscriptionAction upsert, plus the swap: the
 * old endpoint's row dies in the same breath the new one is filed, so a
 * rotation never leaves a corpse for the drain to trip 410s over.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (
    (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase" ||
    !isSupabaseConfigured()
  ) {
    return NextResponse.json({ ok: false, skipped: "not in supabase mode" });
  }

  let body: {
    subscription?: PushSubscriptionJSON;
    oldEndpoint?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 });
  }

  const endpoint = body.subscription?.endpoint;
  const p256dh = body.subscription?.keys?.p256dh;
  const auth = body.subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Incomplete subscription" }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db
    .from("push_subscriptions")
    .upsert(
      { user_id: user.id, endpoint, keys: { p256dh, auth } },
      { onConflict: "endpoint" }
    );
  if (error) {
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  if (body.oldEndpoint && body.oldEndpoint !== endpoint) {
    // Scoped to the caller's own rows, like removePushSubscriptionAction.
    await db
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.oldEndpoint)
      .eq("user_id", user.id);
  }

  return NextResponse.json({ ok: true });
}
