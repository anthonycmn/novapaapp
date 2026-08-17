import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { corsHeaders, userFromBearer } from "@/lib/auth/portal-bridge";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Hand out a short-lived signed URL for one audition file.
 *
 * The audition buckets are private, and they hold video of somebody's child
 * singing in their kitchen. A guessable public URL for that is not acceptable
 * at any convenience, so this route is the only door: it authenticates the
 * caller, checks they may see this student's audition, and mints a URL that
 * expires in ten minutes.
 *
 * Bearer auth is accepted alongside the session cookie so the staff portal can
 * use the same door when the directing team's view is built.
 */
export const runtime = "nodejs";

const KINDS = {
  video: "auditionVideoUrl",
  dance: "danceVideoUrl",
  resume: "resumeUrl",
} as const;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const user = (await getSessionUser()) ?? (await userFromBearer(request));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const studentId = request.nextUrl.searchParams.get("studentId") ?? "";
  const productionId = request.nextUrl.searchParams.get("productionId") ?? "";
  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  if (!studentId || !productionId || !(kind in KINDS)) {
    return NextResponse.json(
      { error: "studentId, productionId and kind are required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  /*
   * Authorization is the provider's, not this route's. getAuditionProfile
   * already enforces "this family, or staff" and throws otherwise — repeating
   * the rule here would be a second copy to drift.
   */
  let profile;
  try {
    profile = await getProvider().getAuditionProfile(user.id, studentId, productionId);
  } catch {
    return NextResponse.json({ error: "Not yours" }, { status: 403, headers: corsHeaders() });
  }
  const stored = profile?.[KINDS[kind as keyof typeof KINDS]];
  if (!stored) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders() });
  }

  // The stored value is a full object URL; the part after /object/<bucket>/ is
  // what the sign endpoint wants.
  const match = /\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(stored);
  if (!match) {
    return NextResponse.json(
      { error: "That file is not in our storage" },
      { status: 400, headers: corsHeaders() }
    );
  }
  const [, bucket, path] = match;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: String(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: "Could not open that file" },
      { status: 502, headers: corsHeaders() }
    );
  }
  const signed = (await response.json()) as { signedURL?: string };
  if (!signed.signedURL) {
    return NextResponse.json(
      { error: "Could not open that file" },
      { status: 502, headers: corsHeaders() }
    );
  }

  return NextResponse.redirect(
    `${url}/storage/v1${signed.signedURL.startsWith("/") ? "" : "/"}${signed.signedURL}`,
    { headers: corsHeaders() }
  );
}
