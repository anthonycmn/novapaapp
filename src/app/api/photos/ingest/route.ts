import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { corsHeaders, userFromBearer } from "@/lib/auth/portal-bridge";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runIngestAndMatch, isMatchingRunning } from "@/lib/jobs/photo-matching";

/**
 * Trigger the ingest + match job (#6). Three ways in:
 *   • a signed-in staff user (the admin Photos page button — session cookie)
 *   • a staff user in the STAFF PORTAL presenting their Supabase access token
 *     as a Bearer header (the portal is a different origin, so the cookie
 *     never travels; the token is the same shared-auth identity, verified
 *     server-side before any work starts)
 *   • a scheduled caller presenting PHOTO_JOB_SECRET (cron / Vercel Cron)
 *
 * Runs on the Node runtime because embedding work is CPU-bound and may
 * exceed edge limits.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** Job status, so the portal can poll honestly instead of guessing. */
export async function GET(request: NextRequest) {
  const user = (await getSessionUser()) ?? (await userFromBearer(request));
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }
  return NextResponse.json({ running: isMatchingRunning() }, { headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  let user = (await getSessionUser()) ?? (await userFromBearer(request));
  let actorId = user?.id;

  if (!user || !hasRoleAtLeast(user, "staff")) {
    // Scheduled invocation path.
    const secret = process.env.PHOTO_JOB_SECRET;
    const presented = request.headers.get("x-job-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
    }
    const systemUser = await getProvider().getUserByEmail("dana@example.com");
    if (!systemUser) {
      return NextResponse.json(
        { error: "No job account configured" },
        { status: 503, headers: corsHeaders() }
      );
    }
    actorId = systemUser.id;
  }

  const result = await runIngestAndMatch(actorId!);
  return NextResponse.json(result, { headers: corsHeaders() });
}
