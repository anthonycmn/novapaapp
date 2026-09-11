/**
 * What a one-time sign-in link is, right now.
 *
 * Pure so it can be tested without a database: the row's two timestamps are
 * the whole story, and the page and the script both need the same reading.
 */
export type LoginLinkState = "ready" | "used" | "expired";

export function loginLinkState(
  link: { expiresAt: string | Date; usedAt: string | Date | null },
  now: Date = new Date()
): LoginLinkState {
  if (link.usedAt) return "used";
  const expires = new Date(link.expiresAt);
  if (Number.isNaN(expires.getTime()) || expires.getTime() <= now.getTime()) return "expired";
  return "ready";
}

/** The shape newToken() makes: 32 random bytes as base64url. Anything else is not ours. */
export function looksLikeLoginToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{40,64}$/.test(token);
}
