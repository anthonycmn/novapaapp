import { NextResponse } from "next/server";
import { resetMockStore } from "@/lib/api/mock/provider";
import { persistMockStore } from "@/lib/api/mock/persistence";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Reset the demo to pristine seed data. Staff sign-in required.
 *
 * Exists for the test-drive phase: after a feedback session leaves the demo
 * full of trial casting boards and half-filled rubrics, staff can start the
 * next session clean. Also how E2E checks tidy up after themselves.
 * Retire this route along with mock mode when Supabase goes live.
 */
export async function POST() {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return NextResponse.json({ error: "Staff sign-in required" }, { status: 403 });
  }

  resetMockStore();
  await persistMockStore();

  return NextResponse.json({
    reset: true,
    note: "Demo data restored to the original seed for every user.",
  });
}
