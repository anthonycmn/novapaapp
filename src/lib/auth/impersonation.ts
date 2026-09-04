import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServiceClient, getPortalReadClient } from "@/lib/api/supabase/client";
import {
  BLOCKED_ACTIONS,
  decodeImpersonation,
  impersonationCookieName,
  type BlockedAction,
} from "./impersonation-token";

/**
 * A Chief standing in a family's shoes.
 *
 * CJ, 4 Sep 2026: "I want the ability to as a super admin - log into anyone's
 * portal as a family member and make changes as needed. So I can log-in as
 * them."
 *
 * HOW SOMEBODY GETS IN. The staff portal is a different origin and cannot set
 * this app's cookie, so entry is a one-time token in a URL: the portal asks
 * /api/impersonate for one, we check the caller is a Chief, and hand back a
 * link. The link is single-use, expires in two minutes, and only its SHA-256 is
 * stored — a token in a URL is a credential sitting in browser history and
 * referrer headers, so the only safe version is one already spent.
 *
 * WHAT IT SETS. The ordinary session cookie, signed exactly as a real sign-in
 * signs it, so every page works with no special cases — plus a second signed
 * cookie naming the impersonation. That second cookie is what the banner and
 * the four guards read. It carries no authority of its own: deleting it grants
 * nothing, it only stops the app knowing to be careful.
 *
 * The crypto lives in ./impersonation-token, which has no server-only import
 * and is therefore testable. This module is the request-bound half.
 */

export {
  BLOCKED_ACTIONS,
  encodeImpersonation,
  hashToken,
  impersonationCookieName,
  newToken,
  sessionTtlMinutes,
  tokenTtlSeconds,
  type BlockedAction,
  type Impersonation,
} from "./impersonation-token";

/**
 * The impersonation this request is inside, if any.
 *
 * Cached per request: the layout asks to draw the banner and every guarded
 * action asks again, and none of that should re-verify an HMAC.
 */
export const currentImpersonation = cache(async () => {
  const jar = await cookies();
  const raw = jar.get(impersonationCookieName)?.value;
  return raw ? decodeImpersonation(raw) : null;
});

/**
 * Refuse one of the four, and write down that it was reached for.
 *
 * Call at the top of the server action, before it validates anything: "may this
 * session do this at all" comes before "is this input any good". Returns null
 * for a real parent, so the ordinary shape is
 * `if (await refuseIfImpersonating("health")) return ...`.
 */
export async function refuseIfImpersonating(
  action: BlockedAction
): Promise<{ blocked: true; message: string } | null> {
  const active = await currentImpersonation();
  if (!active) return null;

  // Best-effort: the refusal must land even if the note about it cannot.
  try {
    await getServiceClient().rpc("append_impersonation_block", {
      p_session: active.id,
      p_action: action,
    });
  } catch {
    /* The block is the point; the audit line is the bonus. */
  }

  return {
    blocked: true,
    message:
      `You are signed in as this family, so ${BLOCKED_ACTIONS[action]} is not something ` +
      `you can do for them. Send them a link instead and they can do it in a moment.`,
  };
}

/**
 * Is this staff portal token a Chief?
 *
 * Two steps, and both matter. The token proves an email; portal_users says what
 * that email is allowed to be. Reading a role from anything the caller sent
 * would make the whole feature a matter of asking nicely.
 */
export async function chiefFromBearer(
  authorization: string | null
): Promise<{ email: string; name: string | null } | null> {
  const header = authorization ?? "";
  if (!header.startsWith("Bearer ")) return null;

  const { data, error } = await getServiceClient().auth.getUser(header.slice(7));
  if (error || !data.user?.email) return null;
  const email = data.user.email.toLowerCase();

  const { data: rows, error: roleError } = await getPortalReadClient()
    .from("portal_users")
    .select("role, full_name, is_active")
    .ilike("email", email)
    .limit(1);
  if (roleError || !rows?.length) return null;

  const row = rows[0] as { role: string; full_name: string | null; is_active: boolean };
  // 'chief' alone. This hands over a live session in somebody else's account;
  // it is the narrowest gate in either product and should stay that way.
  if (!row.is_active || row.role !== "chief") return null;

  return { email, name: row.full_name };
}
