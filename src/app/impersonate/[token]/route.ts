import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api/supabase/client";
import { signSession, sessionCookieName } from "@/lib/auth/session";
import {
  encodeImpersonation,
  hashToken,
  impersonationCookieName,
  sessionTtlMinutes,
} from "@/lib/auth/impersonation";

/**
 * GET /impersonate/<token>  ->  spends the token, sets the session, redirects.
 *
 * The other half of /api/impersonate. Everything that decides whether this is
 * allowed already happened there; this route's whole job is to make the token
 * unusable before it does anything else with it.
 *
 * SPENT FIRST, ACTED ON SECOND. The update that stamps consumed_at is also the
 * check that it had not been consumed: `.is("consumed_at", null)` in the same
 * statement, and no rows back means somebody else got there first. Reading and
 * then writing would leave a window in which a link forwarded to two tabs opens
 * two sessions.
 *
 * It sets the ordinary session cookie, signed exactly as a real sign-in signs
 * it, so no page in this app needs to know that impersonation exists. The
 * second cookie is what the banner and the four guards read.
 */
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  const home = new URL("/login?error=impersonation-expired", request.url);

  if (!token) return NextResponse.redirect(home);

  const now = new Date();
  const { data, error } = await getServiceClient()
    .from("impersonation_sessions")
    .update({ consumed_at: now.toISOString(), started_at: now.toISOString() })
    .eq("token_sha256", hashToken(token))
    .is("consumed_at", null)
    .gt("token_expires_at", now.toISOString())
    .select("id, actor_email, actor_name, target_user_id")
    .maybeSingle();

  if (error || !data) {
    // Used, expired, or never existed. All three are the same answer to
    // whoever is holding the link, and saying which would tell somebody who
    // found it in a log something they should not learn.
    return NextResponse.redirect(home);
  }

  const expiresAt = Date.now() + sessionTtlMinutes * 60 * 1000;
  const response = NextResponse.redirect(new URL("/dashboard", request.url));

  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Both cookies lapse together. A session cookie outliving its marker would
    // be an impersonation that has quietly become an ordinary login.
    maxAge: sessionTtlMinutes * 60,
  };

  response.cookies.set(sessionCookieName, signSession(data.target_user_id), options);
  response.cookies.set(
    impersonationCookieName,
    encodeImpersonation({
      id: data.id,
      actorEmail: data.actor_email,
      actorName: data.actor_name,
      expiresAt,
    }),
    options
  );

  return response;
}
