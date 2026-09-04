import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The cryptography behind impersonation, kept apart from the request-bound half.
 *
 * Separate from impersonation.ts on purpose: everything here is a pure function
 * of its arguments, so it can be tested without a server component, a cookie
 * jar or a Supabase client. That matters more here than almost anywhere else in
 * this app — the marker cookie is the only thing standing between a parent and
 * a forged "a Chief is present", and the only thing that makes the window
 * expire. If it can be forged or outlived, every guard downstream is decoration.
 */

/** How long a Chief stays in, before the session lapses on its own. */
export const sessionTtlMinutes = 60;

/** How long the entry link lives. Long enough to redirect, not to sit in a tab. */
export const tokenTtlSeconds = 120;

export const impersonationCookieName = "novapa_impersonation";

/** The four where the answer to "can I do this as them" is always no. */
export const BLOCKED_ACTIONS = {
  document: "adding to or removing from a family's own documents",
  pickup: "changing who may collect a child",
  health: "editing health and allergy information",
  store: "buying something",
} as const;

export type BlockedAction = keyof typeof BLOCKED_ACTIONS;

export interface Impersonation {
  id: string;
  actorEmail: string;
  actorName: string | null;
  /** When the whole thing lapses, whatever the browser thinks. */
  expiresAt: number;
}

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is required to impersonate.");
  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** `base64url(json).hmac` — unforgeable without SESSION_SECRET. */
export function encodeImpersonation(value: Impersonation): string {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeImpersonation(raw: string): Impersonation | null {
  const idx = raw.lastIndexOf(".");
  if (idx < 1) return null;
  const body = raw.slice(0, idx);
  const given = raw.slice(idx + 1);
  const expected = sign(body);
  if (expected.length !== given.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return null;
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString()) as Impersonation;
    if (!parsed?.id || typeof parsed.expiresAt !== "number") return null;
    /*
     * An expired marker is not an impersonation.
     *
     * Returning null here is what makes the window real rather than advisory:
     * the guards stop firing and the banner disappears. The session cookie is
     * set to lapse at the same moment, so what is left is nothing at all —
     * but even if a browser held on to it, this is the half that decides.
     */
    if (Date.now() > parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}
