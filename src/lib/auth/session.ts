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

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const userId = jar.get(SESSION_COOKIE)?.value;
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
