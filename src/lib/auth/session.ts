import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { getProvider } from "@/lib/api";
import type { Role, SessionUser } from "@/lib/api/types";

/**
 * Session handling.
 *
 * Mock mode: a signed-ish cookie carries the demo user id (no secrets to
 * protect — seed data only). Supabase mode: replaced by @supabase/ssr
 * cookie session; this module keeps the same exports so nothing else
 * changes.
 */

const SESSION_COOKIE = "novapa_session";

const isSupabaseMode = () =>
  (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required when NEXT_PUBLIC_DATA_MODE=supabase");
  }
  return secret;
}

/** Supabase mode: cookie carries `userId.hmac` so it can't be forged. */
export function signSession(userId: string): string {
  const signature = createHmac("sha256", sessionSecret())
    .update(userId)
    .digest("base64url");
  return `${userId}.${signature}`;
}

function verifySessionCookie(value: string): string | null {
  if (!isSupabaseMode()) return value; // mock: raw demo id, by design
  const idx = value.lastIndexOf(".");
  if (idx < 1) return null;
  const userId = value.slice(0, idx);
  const expected = createHmac("sha256", sessionSecret())
    .update(userId)
    .digest("base64url");
  const given = value.slice(idx + 1);
  if (expected.length !== given.length) return null;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(given)) ? userId : null;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const userId = verifySessionCookie(raw);
  if (!userId) return null;
  return resolveUser(userId);
}

const resolveUser = cache(async (userId: string): Promise<SessionUser | null> => {
  const provider = getProvider();
  const user = await provider.getUserById(userId);
  if (!user) return null;
  const session: SessionUser = { ...user };
  if (user.familyId) {
    session.family = (await provider.getFamily(user.id, user.familyId)) ?? undefined;
  }
  return session;
});

const ROLE_RANK: Record<Role, number> = {
  student: 0,
  parent: 1,
  staff: 2,
  admin: 3,
  super_admin: 4,
};

export function hasRoleAtLeast(user: { role: Role }, minimum: Role): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

export const sessionCookieName = SESSION_COOKIE;
