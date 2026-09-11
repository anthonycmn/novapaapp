import "server-only";
import { org } from "@/config/org";
import { getServiceClient } from "@/lib/api/supabase/client";
import { hashToken, newToken } from "./impersonation-token";
import { looksLikeLoginToken } from "./login-link-state";

/**
 * One-time sign-in links, issued by the office for one known account.
 *
 * The password reset exists for the parent who can drive it. This exists for
 * the one who cannot: Kelly Watson (Frozen Jr., 8–9 Sep 2026) reached the
 * reset form on her phone four times and never got a password saved, and the
 * only thing the office could offer was a fifth link of the same kind.
 *
 * Three properties, each load-bearing:
 *
 * - Only the SHA-256 of the token is stored (same helper as impersonation), so
 *   a copy of the URL in a mail log or a browser history is already worthless.
 * - The row is spent by a button press on the welcome page, not by loading it.
 *   Every one of Kelly's reset links was fetched by a mail-security proxy
 *   before she saw it; a GET here hands that proxy a page, not a session.
 * - It is never minted from a public form. There is no address to type, so it
 *   cannot be used to learn which emails have accounts.
 */

export const loginLinkTtlDays = 7;

export interface IssuedLoginLink {
  url: string;
  expiresAt: Date;
}

export async function issueLoginLink(input: {
  userId: string;
  email: string;
  issuedBy?: string | null;
  note?: string | null;
  ttlDays?: number;
}): Promise<IssuedLoginLink> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + (input.ttlDays ?? loginLinkTtlDays) * 86_400_000);
  const { error } = await getServiceClient().from("login_links").insert({
    user_id: input.userId,
    email: input.email.toLowerCase(),
    token_sha256: hashToken(token),
    issued_by: input.issuedBy ?? null,
    note: input.note ?? null,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(`Could not issue a sign-in link: ${error.message}`);
  return { url: `${org.portalUrl}/welcome/${token}`, expiresAt };
}

export interface PeekedLoginLink {
  email: string;
  displayName: string | null;
}

/** Who this link is for, without spending it. Null for used, expired or unknown. */
export async function peekLoginLink(token: string): Promise<PeekedLoginLink | null> {
  if (!looksLikeLoginToken(token)) return null;
  const db = getServiceClient();
  const { data } = await db
    .from("login_links")
    .select("user_id, email")
    .eq("token_sha256", hashToken(token))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;

  // A parent who has never signed in has no profile yet; the guardian row
  // carries the name the office knows them by.
  const { data: profile } = await db
    .from("profiles")
    .select("display_name")
    .eq("id", data.user_id)
    .maybeSingle();
  let displayName: string | null = profile?.display_name ?? null;
  if (!displayName) {
    const { data: guardian } = await db
      .from("guardians")
      .select("full_name")
      .ilike("email", data.email)
      .limit(1)
      .maybeSingle();
    displayName = guardian?.full_name ?? null;
  }
  // An email standing in for a name is not a name.
  if (displayName && displayName.includes("@")) displayName = null;
  return { email: data.email, displayName };
}

/**
 * Spend the link. The update that stamps used_at is also the check that it was
 * null — one statement, so a link opened in two tabs yields one session.
 */
export async function spendLoginLink(
  token: string
): Promise<{ userId: string; email: string } | null> {
  if (!looksLikeLoginToken(token)) return null;
  const now = new Date().toISOString();
  const { data, error } = await getServiceClient()
    .from("login_links")
    .update({ used_at: now })
    .eq("token_sha256", hashToken(token))
    .is("used_at", null)
    .gt("expires_at", now)
    .select("user_id, email")
    .maybeSingle();
  if (error || !data) return null;
  return { userId: data.user_id as string, email: data.email as string };
}
