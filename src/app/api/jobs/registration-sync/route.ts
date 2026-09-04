import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import {
  getRegistrationProvider,
  RegistrationUnavailableError,
} from "@/lib/api/registration";
import { provisionNewWebsiteAccounts } from "@/lib/api/registration/provision";
import { jobActorId } from "@/lib/jobs/actor";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * The registration sync, on a schedule at last. Invoked every 15 minutes by
 * netlify/functions/registration-sync.mjs, or by staff for testing.
 *
 * Until 2026-09-04 the sync only ran when a human pressed "resync" (or via a
 * webhook nothing was configured to call). Ten paid Frozen registrations sat
 * invisible to their families for up to two weeks because nobody pressed the
 * button — a parent paid on the website and their child appeared in no
 * roster until a staff member happened to think of it. A sync that keeps
 * families' view of their own children current is not a button; it is a
 * heartbeat.
 *
 * Two steps, in order:
 *   1. provisionNewWebsiteAccounts — families/students for checkouts the hub
 *      has never seen (see provision.ts for the collision guard).
 *   2. the ordinary snapshot sync, which then has somebody to attach every
 *      new enrollment to.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  let actorId = user?.id;

  if (!user || !hasRoleAtLeast(user, "staff")) {
    const secret = process.env.CRON_SECRET;
    const presented = request.headers.get("x-cron-secret") ?? "";
    if (!secret || presented !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    actorId = (await jobActorId()) ?? undefined;
    if (!actorId) {
      return NextResponse.json({ error: "No job account" }, { status: 503 });
    }
  }

  const provider = getProvider();
  const registration = getRegistrationProvider();

  try {
    const provision = await provisionNewWebsiteAccounts();
    const snapshot = await registration.fetchSnapshot();
    const run = await provider.syncRegistration(actorId!, snapshot, "scheduled");
    return NextResponse.json({
      ok: true,
      provision: {
        familiesCreated: provision.familiesCreated,
        studentsCreated: provision.studentsCreated,
        profilesAttached: provision.profilesAttached,
        collisions: provision.collisions.length,
      },
      status: run.status,
      counts: run.counts,
      issues: run.issues.length,
    });
  } catch (error) {
    const message =
      error instanceof RegistrationUnavailableError
        ? error.message
        : `Unexpected sync error: ${String(error)}`;
    await provider.recordSyncFailure(
      actorId!,
      registration.source,
      "scheduled",
      message
    );
    // 200 with ok:false — the sync failed, the request did not. The failed
    // run is already visible in the admin health view.
    return NextResponse.json({ ok: false, error: message });
  }
}
