import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runIngestAndMatch } from "@/lib/jobs/photo-matching";

/**
 * Trigger the ingest + match job (#6). Two ways in:
 *   • a signed-in staff user (the admin Photos page button)
 *   • a scheduled caller presenting PHOTO_JOB_SECRET (cron / Vercel Cron)
 *
 * Runs on the Node runtime because embedding work is CPU-bound and may
 * exceed edge limits.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  let actorId = user?.id;

  if (!user || !hasRoleAtLeast(user, "staff")) {
    // Scheduled invocation path.
    const secret = process.env.PHOTO_JOB_SECRET;
    const presented = request.headers.get("x-job-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const systemUser = await getProvider().getUserByEmail("dana@example.com");
    if (!systemUser) {
      return NextResponse.json({ error: "No job account configured" }, { status: 503 });
    }
    actorId = systemUser.id;
  }

  const result = await runIngestAndMatch(actorId!);
  return NextResponse.json(result);
}
