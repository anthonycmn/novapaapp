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

/**
 * Decode + verify, shared by both token families. One copy of the
 * timing-safe comparison, so a fix to verification cannot land in one
 * decoder and miss the other.
 */
function verifiedPayload(token: string): string | null {
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
  return payload;
}

export function decodeTrackingToken(token: string): TrackingRef | null {
  const payload = verifiedPayload(token);
  if (payload === null) return null;

  const [sendId, recipientId] = payload.split(":");
  if (!sendId || !recipientId) return null;
  return { sendId, recipientId };
}

/* ── unsubscribe tokens ─────────────────────────────────────────────────── */

/**
 * Only these categories carry an unsubscribe link, and only these may be
 * opted out of. Everything else is safety or logistics — the schema's own
 * CHECK refuses a `critical` opt-out row — and CAN-SPAM does not require an
 * opt-out for transactional mail.
 */
export const OPT_OUT_CATEGORIES = new Set(["newsletter", "fundraising"]);

export interface UnsubscribeRef {
  recipientId: string;
  category: string;
}

/** Same secret, distinct payload shape — see decode for the shape check. */
export function encodeUnsubscribeToken(ref: UnsubscribeRef): string {
  const payload = `unsub:${ref.recipientId}:${ref.category}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function decodeUnsubscribeToken(token: string): UnsubscribeRef | null {
  const payload = verifiedPayload(token);
  if (payload === null) return null;

  const [kind, recipientId, category] = payload.split(":");
  if (kind !== "unsub" || !recipientId || !OPT_OUT_CATEGORIES.has(category ?? "")) return null;
  return { recipientId, category: category! };
}

/**
 * Rewrites links in an email body to go through the click tracker, and
 * appends the open-tracking pixel.
 *
 * Deliberately skips `mailto:` and `tel:` — rewriting those would break
 * them — and skips the unsubscribe link, because a tracker sitting between
 * a family and their opt-out is a dark pattern.
 *
 * When the send is an opt-outable category, the per-recipient unsubscribe
 * link is appended here — the one place every delivery path already visits
 * per recipient. It was designed, defended in comments, and never emitted
 * until the Sep 5 2026 audit found newsletters going out with no way off.
 */
export function instrumentEmailBody(
  body: string,
  ref: TrackingRef,
  origin: string,
  category?: string,
  /* A plain-text send gets plain-text additions: no pixel (nothing renders
     it), and the unsubscribe as a bare URL — the <a> version arrived as
     literal markup in exactly the newsletters the link was added for
     (Sep 6 2026 review). Defaults to HTML, the shape every pre-existing
     caller assumed. */
  asHtml: boolean = true
): string {
  const token = encodeTrackingToken(ref);

  const withTrackedLinks = body.replace(
    /https?:\/\/[^\s<>"')]+/g,
    (url) => {
      if (url.includes("/unsubscribe")) return url;
      return `${origin}/api/email/click/${token}?url=${encodeURIComponent(url)}`;
    }
  );

  const pixel = asHtml
    ? `\n\n<img src="${origin}/api/email/open/${token}" width="1" height="1" alt="" style="display:none">`
    : "";

  const optOutable = Boolean(category && OPT_OUT_CATEGORIES.has(category));
  const unsubscribeUrl = optOutable
    ? `${origin}/unsubscribe/${encodeUnsubscribeToken({ recipientId: ref.recipientId, category: category! })}`
    : null;
  const unsubscribe = !unsubscribeUrl
    ? ""
    : asHtml
      ? `\n<p style="margin:16px 0 0;text-align:center;font-size:12px;color:#8a8a8a;">` +
        `Don't want these emails? ` +
        `<a href="${unsubscribeUrl}" style="color:#8a8a8a;">Unsubscribe</a>.` +
        ` Safety and schedule messages always come through.</p>`
      : `\n\n—\nDon't want these emails? Unsubscribe: ${unsubscribeUrl}\n` +
        `Safety and schedule messages always come through.`;

  return withTrackedLinks + pixel + unsubscribe;
}
