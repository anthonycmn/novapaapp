import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getServiceClient } from "@/lib/api/supabase/client";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runIngestAndMatch, isMatchingRunning } from "@/lib/jobs/photo-matching";
import type { SessionUser } from "@/lib/api/types";

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

const PORTAL_ORIGIN =
  process.env.STAFF_PORTAL_ORIGIN ?? "https://novapa-staff-portal.netlify.app";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": PORTAL_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** Resolve a portal caller: Supabase Bearer token → the same hub user. */
async function userFromBearer(request: NextRequest): Promise<SessionUser | null> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const { data, error } = await getServiceClient().auth.getUser(token);
    if (error || !data.user) return null;
    const user = await getProvider().getUserById(data.user.id);
    return user ? { ...user } : null;
  } catch {
    return null;
  }
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
