import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import {
  getRegistrationProvider,
  RegistrationUnavailableError,
} from "@/lib/api/registration";
import { corsHeaders, userFromBearer } from "@/lib/auth/portal-bridge";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * "Resync now", for the staff portal.
 *
 * The read side of registration health needs no bridge — the portal reads
 * registration_sync_runs and registration_account_links straight out of
 * family_hub with the signed-in user's own token, judged by this app's RLS
 * (`sync_runs_read` is is_staffish()). Triggering a sync is different: it
 * needs this app's service key and its registration provider, neither of
 * which exists in the portal by design. So it goes through the same server
 * bridge as /api/photos/ingest — the caller presents their Supabase access
 * token, verified here before any work starts.
 *
 * A failure is recorded as a failed SyncRun rather than thrown away, so it
 * surfaces in the health view instead of disappearing into a log. Same
 * contract as the in-app server action (lib/actions/registration.ts); this
 * is the cross-origin door to it, not a second implementation of the job.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(request: NextRequest) {
  const user = (await getSessionUser()) ?? (await userFromBearer(request));
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders() }
    );
  }

  const provider = getProvider();
  const registration = getRegistrationProvider();

  try {
    const snapshot = await registration.fetchSnapshot();
    const run = await provider.syncRegistration(user.id, snapshot, "manual");
    return NextResponse.json(
      { ok: true, status: run.status, counts: run.counts, issues: run.issues.length },
      { headers: corsHeaders() }
    );
  } catch (error) {
    const message =
      error instanceof RegistrationUnavailableError
        ? error.message
        : `Unexpected sync error: ${String(error)}`;
    await provider.recordSyncFailure(user.id, registration.source, "manual", message);
    // 200 with ok:false — the sync failed, the request did not. The portal
    // shows the message and the failed run is already in the history.
    return NextResponse.json(
      { ok: false, error: message },
      { headers: corsHeaders() }
    );
  }
}
