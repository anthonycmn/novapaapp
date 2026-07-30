import { NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { isPersistenceActive } from "@/lib/api/mock/persistence";

/**
 * Diagnostic: proves demo-data writes survive across serverless instances.
 *
 * Each POST bumps the heart count on the seeded welcome post through the
 * exact same provider path the UI uses, then reads it back. Calling this
 * repeatedly must return a strictly increasing count — if it resets, the
 * persistence layer is broken and every save in the app is too. This is
 * the check that would have caught the rubric-save bug before a human did.
 */
export async function POST() {
  const provider = getProvider();
  const post = await provider.reactToPost("user-sofia", "post-welcome", "heart");

  return NextResponse.json({
    persistenceActive: await isPersistenceActive(),
    heartCount: post.reactionCounts.heart,
    note: "POST again — heartCount must keep increasing across requests.",
  });
}
