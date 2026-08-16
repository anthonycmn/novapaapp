import "server-only";
import type { NextRequest } from "next/server";
import { getProvider } from "@/lib/api";
import { getServiceClient } from "@/lib/api/supabase/client";
import type { SessionUser } from "@/lib/api/types";

/**
 * The staff portal ↔ parent portal server bridge.
 *
 * The staff portal is a different origin, so the hub's session cookie never
 * travels with its requests. Both products share one Supabase auth, though —
 * so a portal user proves who they are by sending their own access token as
 * a Bearer header, and we verify it server-side before any work starts.
 * First used by /api/photos/ingest; every portal-called route shares this.
 */

export const PORTAL_ORIGIN =
  process.env.STAFF_PORTAL_ORIGIN ?? "https://novapa-staff-portal.netlify.app";

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": PORTAL_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
}

/** Resolve a portal caller: Supabase Bearer token → the same hub user. */
export async function userFromBearer(request: NextRequest): Promise<SessionUser | null> {
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
