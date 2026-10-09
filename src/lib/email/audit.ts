import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "@/lib/api/supabase/client";
import { AUTO_RESPONDER_SUPPRESSION_HEADERS } from "@/lib/api/email";

/**
 * The parent portal's half of the email audit (staff portal 0338).
 *
 * CJ, 5 Oct 2026: "whenever an email is sent through the portal have admin
 * receive it as well as a bcc and then audit it - show me who opened it, who
 * it went to, when they opened it, if they clicked any links, where they
 * opened it from - i want all the tracking data. show me if something
 * bounces."
 *
 * Every message ResendEmailProvider sends gets a row in
 * staff_portal.mail_messages — the ledger the staff portal's Email audit page
 * reads, shared with the staff portal's own mail so the question "what did we
 * send the Smiths this week" has one answer. The row's id is the tracking
 * token: /api/mail/open and /api/mail/click record IP, device and city against
 * it, and the staff portal's mail-webhook records delivery and bounces against
 * the Resend id stamped here.
 *
 * This sits UNDER the family email desk's own tracking, not in place of it: a
 * family link is wrapped twice and a click passes through both, each recording
 * its own thing. Opens are the exception: the desk's own pixel is HTML-only and
 * staff write text, so the per-send open counts read THIS ledger (staff portal
 * 0356, getEmailEngagement), keyed by batch_id = the send's id.
 *
 * The staff portal has the twin of this file (netlify/functions/_mailTracking.ts)
 * and the two sign links identically — both derive the key from the one
 * service-role key the apps share.
 *
 * Nothing here may stop an email. Every database call is caught: an audit that
 * cannot be written is a gap in a report, a family who never got the message
 * is a phone call.
 */

export interface MailAudit {
  /** What sent it: 'family_email', 'audition_receipt', … Defaults to the category. */
  kind?: string;
  /** The press of Send this belongs to. A batch gets one office copy, sent by the caller. */
  batchId?: string;
  sentBy?: string;
}

/** The office's copy goes here. ADMIN_COPY_TO overrides. */
export function adminCopyTo(): string {
  return (process.env.ADMIN_COPY_TO || "info@novapa.org").trim().toLowerCase();
}

/** Where the pixel and the click redirect live. */
export function trackingOrigin(): string {
  return (
    process.env.URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://portal.novapa.org"
  ).replace(/\/+$/, "");
}

function key(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return k ? createHmac("sha256", k).update("novapa-mail-tracking").digest("hex") : null;
}

export function signLink(messageId: string, url: string): string | null {
  const k = key();
  return k
    ? createHmac("sha256", k).update(`${messageId}\n${url}`).digest("hex").slice(0, 32)
    : null;
}

export function verifyLink(messageId: string, url: string, sig: string): boolean {
  const want = signLink(messageId, url);
  if (!want || !sig || sig.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A plain-text email as the simplest HTML that looks the same, so it can carry
 * a pixel. Without this a text-only send can never show as opened — and most
 * notes typed into the family email desk are text.
 */
export function textAsHtml(text: string): string {
  const linked = escapeHtml(text).replace(
    /https?:\/\/[^\s<]+/g,
    (u) => `<a href="${u}">${u}</a>`
  );
  return (
    `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;` +
    `line-height:1.5;white-space:pre-wrap">${linked}</div>`
  );
}

/** Every http(s) link through /api/mail/click, and the pixel at the foot. */
export function instrumentForAudit(html: string, messageId: string): string {
  if (!key()) return html;
  const base = trackingOrigin();
  const rewritten = html.replace(
    /href=(["'])(https?:\/\/[^"']+)\1/gi,
    (whole, q: string, raw: string) => {
      if (raw.includes("/api/mail/click")) return whole;
      const url = raw.replace(/&amp;/g, "&");
      const href =
        `${base}/api/mail/click?m=${messageId}` +
        `&u=${encodeURIComponent(url)}&s=${signLink(messageId, url)}`;
      return `href=${q}${href.replace(/&/g, "&amp;")}${q}`;
    }
  );
  const pixel =
    `<img src="${base}/api/mail/open?m=${messageId}" width="1" height="1" alt="" ` +
    `style="display:block;width:1px;height:1px;border:0;opacity:0" />`;
  return /<\/body>/i.test(rewritten)
    ? rewritten.replace(/<\/body>/i, `${pixel}</body>`)
    : rewritten + pixel;
}

function ledger() {
  return getServiceClient().schema("staff_portal").from("mail_messages");
}

/** The ledger row for one send. null when it could not be written. */
export async function openLedger(
  to: string,
  subject: string,
  kind: string,
  audit: MailAudit | undefined
): Promise<string | null> {
  try {
    const { data, error } = await ledger()
      .insert({
        app: "parent",
        kind: audit?.kind || kind,
        batch_id: audit?.batchId ?? null,
        sent_by: audit?.sentBy ?? null,
        to_email: to.trim().toLowerCase(),
        subject,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data as { id: string }).id;
  } catch (e) {
    console.error("[mail-audit] could not open a ledger row", e);
    return null;
  }
}

export async function stampLedger(id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  try {
    const { error } = await ledger().update(patch).eq("id", id);
    if (error) throw error;
  } catch (e) {
    console.error("[mail-audit] could not stamp a ledger row", e);
  }
}

/** One event against a ledger row, from the pixel or the click redirect. */
export async function recordMailEvent(row: Record<string, unknown>): Promise<void> {
  try {
    await getServiceClient().schema("staff_portal").from("mail_events").insert(row);
  } catch {
    // Unknown id or no ledger — never the reader's problem.
  }
}

/**
 * Who fetched the pixel or followed the link, as Netlify's edge saw them.
 * x-nf-geo is the edge's IP lookup, base64 JSON or plain JSON by runtime.
 */
export function visitorOf(headers: Headers) {
  const ip =
    headers.get("x-nf-client-connection-ip") ||
    (headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    null;
  let city: string | null = null;
  let region: string | null = null;
  let country: string | null = headers.get("x-country");
  const raw = headers.get("x-nf-geo");
  if (raw) {
    for (const text of [raw, Buffer.from(raw, "base64").toString("utf8")]) {
      try {
        const g = JSON.parse(text) as {
          city?: string;
          country?: { code?: string; name?: string };
          subdivision?: { code?: string; name?: string };
        };
        city = g.city ?? null;
        region = g.subdivision?.name ?? g.subdivision?.code ?? null;
        country = g.country?.name ?? g.country?.code ?? country;
        break;
      } catch {
        /* the other encoding */
      }
    }
  }
  return { ip, user_agent: headers.get("user-agent"), city, region, country };
}

/**
 * The office copy: the message as written, under a strip naming who it went
 * to. A SEPARATE send, never a Bcc — a Bcc carries the family's pixel, and the
 * office reading its copy would be recorded as the family reading theirs.
 * Untracked, unaudited, and it never throws.
 */
export async function sendAdminCopy(copy: {
  subject: string;
  text: string;
  html?: string;
  recipients: string[];
  kind?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const n = copy.recipients.length;
  if (!apiKey || !n) return;
  try {
    // The one email the office gets for a group send, so it names everyone it
    // reached — the whole list, not "three and twenty more" (CJ, 8 Oct 2026).
    const who = n === 1 ? copy.recipients[0] : `${n} recipients`;
    const list = n === 1 ? "" : copy.recipients.join(", ");
    const when = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      dateStyle: "medium",
      timeStyle: "short",
    });
    const strip =
      `<div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.5;background:#FFF7E0;` +
      `border:1px solid #E8B84B;border-radius:6px;padding:10px 14px;margin:0 0 16px 0;color:#3C4657">` +
      `<strong>Office copy</strong> — sent to ${escapeHtml(who)} on ${escapeHtml(when)}` +
      `${copy.kind ? ` · ${escapeHtml(copy.kind.replace(/[_-]/g, " "))}` : ""}. ` +
      `Opens, clicks and bounces are on the staff portal's Email audit page.` +
      `${list ? `<div style="margin-top:6px"><strong>Sent to:</strong> ${escapeHtml(list)}</div>` : ""}</div>`;
    const body = copy.html ?? textAsHtml(copy.text);
    const html = /<body[^>]*>/i.test(body)
      ? body.replace(/<body[^>]*>/i, (b) => b + strip)
      : strip + body;
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM_ADDRESS ?? "NoVAPA <onboarding@resend.dev>",
        to: adminCopyTo(),
        subject: `[Copy] ${copy.subject}`,
        text: `Office copy — sent to ${who} on ${when}.${list ? `\nSent to: ${list}` : ""}\n\n${copy.text}`,
        html,
        headers: AUTO_RESPONDER_SUPPRESSION_HEADERS,
        tags: [{ name: "app", value: "parent-copy" }],
      }),
    });
  } catch (e) {
    console.error("[mail-audit] office copy failed", e);
  }
}
