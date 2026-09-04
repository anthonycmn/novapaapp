import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getServiceClient } from "@/lib/api/supabase/client";
import { corsHeaders } from "@/lib/auth/portal-bridge";
import {
  chiefFromBearer,
  hashToken,
  newToken,
  tokenTtlSeconds,
} from "@/lib/auth/impersonation";

/**
 * POST { email, reason? }  ->  { url }   a one-time link into that person's account.
 *
 * Called by the staff portal, which is a different origin and therefore cannot
 * set this app's cookie. It presents the Chief's own Supabase access token; we
 * verify that token against Supabase, look the email up in the staff portal's
 * portal_users, and require role 'chief'. Nothing the caller sends decides
 * whether they may do this.
 *
 * The answer is a URL, not a session. It is single-use, lasts two minutes, and
 * only its hash is stored -- see lib/auth/impersonation for why a token that
 * travels in a URL has to be one that is already spent by the time anybody
 * finds it in a log.
 *
 * WHO MAY BE ENTERED. Parents and students only. Impersonating another member
 * of staff is a different and worse idea than impersonating a customer: it
 * would let one Chief act as another with the second Chief's name on it, and
 * there is no support call that needs it.
 */
export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const chief = await chiefFromBearer(request.headers.get("authorization"));
  if (!chief) {
    return NextResponse.json(
      { error: "Only a Chief in the staff portal can sign in as a family." },
      { status: 403, headers: corsHeaders() }
    );
  }

  let body: { email?: string; reason?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Expected a JSON body." },
      { status: 400, headers: corsHeaders() }
    );
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json(
      { error: "Say which person to sign in as." },
      { status: 400, headers: corsHeaders() }
    );
  }

  const target = await getProvider().getUserByEmail(email);
  if (!target) {
    // Distinguish "no account" from "not allowed": a guardian who has never
    // accepted their invitation has no hub user at all, and the fix for that
    // is an invitation, not a permission.
    return NextResponse.json(
      {
        error:
          "Nobody has signed up for the parent portal with that address, so there is no account to enter. Invite them first.",
      },
      { status: 404, headers: corsHeaders() }
    );
  }

  if (target.role !== "parent" && target.role !== "student") {
    return NextResponse.json(
      { error: "Only a parent or student account can be entered this way." },
      { status: 400, headers: corsHeaders() }
    );
  }

  const token = newToken();
  const { data, error } = await getServiceClient()
    .from("impersonation_sessions")
    .insert({
      actor_email: chief.email,
      actor_name: chief.name,
      target_user_id: target.id,
      target_email: target.email,
      target_family_id: target.familyId ?? null,
      reason: String(body.reason ?? "").trim() || null,
      token_sha256: hashToken(token),
      token_expires_at: new Date(Date.now() + tokenTtlSeconds * 1000).toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    // No row, no entry. The record is not a side effect of this feature, it is
    // the half that makes the other half defensible.
    return NextResponse.json(
      { error: `Could not open a session: ${error?.message ?? "unknown error"}` },
      { status: 500, headers: corsHeaders() }
    );
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  return NextResponse.json(
    {
      url: `${origin}/impersonate/${token}`,
      expiresInSeconds: tokenTtlSeconds,
      target: { name: target.displayName, email: target.email },
    },
    { headers: corsHeaders() }
  );
}
