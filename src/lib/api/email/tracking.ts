import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Email open and click tracking (#1).
 *
 * Tracking identifiers are signed. Without a signature anyone could POST
 * arbitrary (sendId, recipientId) pairs and poison the analytics, or worse,
 * enumerate who is on a mailing list. The token carries the ids plus an HMAC
 * over them, so only links we generated are counted.
 */

function secret(): string {
  // Falls back to a build-stable value so tracking works in mock mode; a real
  // deployment sets EMAIL_TRACKING_SECRET.
  return process.env.EMAIL_TRACKING_SECRET ?? "novapa-dev-tracking-secret";
}

export interface TrackingRef {
  sendId: string;
  recipientId: string;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function encodeTrackingToken(ref: TrackingRef): string {
  const payload = `${ref.sendId}:${ref.recipientId}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function decodeTrackingToken(token: string): TrackingRef | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = sign(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [sendId, recipientId] = payload.split(":");
  if (!sendId || !recipientId) return null;
  return { sendId, recipientId };
}

/**
 * Rewrites links in an email body to go through the click tracker, and
 * appends the open-tracking pixel.
 *
 * Deliberately skips `mailto:` and `tel:` — rewriting those would break
 * them — and skips the unsubscribe link, because a tracker sitting between
 * a family and their opt-out is a dark pattern.
 */
export function instrumentEmailBody(
  body: string,
  ref: TrackingRef,
  origin: string
): string {
  const token = encodeTrackingToken(ref);

  const withTrackedLinks = body.replace(
    /https?:\/\/[^\s<>"')]+/g,
    (url) => {
      if (url.includes("/unsubscribe")) return url;
      return `${origin}/api/email/click/${token}?url=${encodeURIComponent(url)}`;
    }
  );

  const pixel = `\n\n<img src="${origin}/api/email/open/${token}" width="1" height="1" alt="" style="display:none">`;
  return withTrackedLinks + pixel;
}
