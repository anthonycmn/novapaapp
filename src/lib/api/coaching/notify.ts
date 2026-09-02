import "server-only";
import { org } from "@/config/org";
import { formatCents } from "@/lib/format";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { getPortalRpcClient, isSupabaseConfigured } from "../supabase/client";
import {
  bookingForCoach,
  bookingForFamily,
  cancellationForCoach,
  cancellationForFamily,
  purchaseNoticeFromRow,
  receiptForFamily,
  saleForOffice,
  sessionNoticeFromRow,
  type Message,
  type PurchaseNotice,
  type SessionNotice,
} from "./notices";

/**
 * Telling people that coaching was bought, booked or called off.
 *
 * ---------------------------------------------------------------------------
 * NOTHING IN HERE MAY BREAK WHAT IT REPORTS
 * ---------------------------------------------------------------------------
 * This module is called AFTER the booking is made and after the money has
 * moved. A booking that succeeded and an email that failed is a booking, and
 * the family must not be shown a red box over it. So every function here
 * returns a tally and never throws: a Resend outage, a portal that is briefly
 * unreachable, a coach with no address on file — all of them come back as a
 * count, and the caller carries on.
 *
 * That is also why nothing is retried. The record of the attempt goes into
 * `coaching_client_emails` (portal 0211) where the client drawer already shows
 * a family's mail history, so a send that failed is visible to CJ next to the
 * ones that worked — which is the state that matters when a parent says nobody
 * told them. A queue would be a better answer and a much bigger one; this is
 * the honest small version.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PORTAL IS ASKED AGAIN
 * ---------------------------------------------------------------------------
 * The caller already knows the session id it just created, and knows nothing
 * else it should be trusted with. Every name, address and count is read back
 * out of the portal at this moment (0211), so the sentence "that leaves you
 * two sessions" is true when it is written rather than true when the page
 * loaded.
 */

/** What happened, for the caller's logs and for tests. */
export interface NotifyResult {
  /** Messages that the delivery adapter accepted. */
  sent: number;
  /** Messages we meant to send. Zero means there was nobody to write to. */
  attempted: number;
}

const NOTHING: NotifyResult = { sent: 0, attempted: 0 };

/** Where a reply to any of this should land: a person, never the portal. */
function officeEmail(): string {
  return (
    process.env.COACHING_OFFICE_EMAIL?.trim() ||
    process.env.COACHING_REPLY_TO?.trim() ||
    org.supportEmail
  );
}

function portalUrl(): string {
  return process.env.URL ?? "https://portal.novapa.org";
}

/**
 * One send, and its record.
 *
 * `clientId` present means this message is part of a family's history and
 * belongs in `coaching_client_emails`; the coach's copy and the office alert
 * are internal and are not filed against a client. The log write is itself
 * best-effort — losing the record of a send must not turn into losing the
 * send.
 */
async function deliver(
  to: string,
  message: Message,
  options: {
    category: string;
    template: string;
    clientId?: string | null;
    sessionId?: string | null;
  }
): Promise<boolean> {
  let ok = false;
  let providerId = "";
  let failure: string | null = null;

  try {
    const receipt = await getEmailDeliveryProvider().send({
      to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      category: options.category,
      replyTo: officeEmail(),
    });
    ok = receipt.ok;
    providerId = receipt.id;
    if (!ok) failure = "The mail provider refused the message.";
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  if (options.clientId) {
    try {
      await getPortalRpcClient().rpc("log_coaching_notice", {
        p_client_id: options.clientId,
        p_template: options.template,
        p_subject: message.subject,
        p_to_email: to,
        p_body_text: message.text,
        p_session_id: options.sessionId ?? null,
        p_provider_id: providerId || null,
        p_error: failure ? failure.slice(0, 500) : null,
      });
    } catch {
      // Deliberately silent. See the header: the send is what matters.
    }
  }

  return ok;
}

async function readSessionNotice(sessionId: string): Promise<SessionNotice | null> {
  try {
    const { data, error } = await getPortalRpcClient().rpc("coaching_session_notice", {
      p_session_id: sessionId,
    });
    if (error) return null;
    return sessionNoticeFromRow(data);
  } catch {
    return null;
  }
}

async function readPurchaseNotice(reference: string): Promise<PurchaseNotice | null> {
  try {
    const { data, error } = await getPortalRpcClient().rpc("coaching_purchase_notice", {
      p_reference: reference,
    });
    if (error) return null;
    return purchaseNoticeFromRow(data);
  } catch {
    return null;
  }
}

/**
 * A family booked a session.
 *
 * Both copies go out together rather than one after the other: neither is
 * waiting on the other's answer, and the coach's copy is the one with a
 * deadline on it.
 */
export async function notifyCoachingBooked(sessionId: string): Promise<NotifyResult> {
  if (!isSupabaseConfigured() || !sessionId) return NOTHING;

  const notice = await readSessionNotice(sessionId);
  if (!notice) return NOTHING;

  const url = portalUrl();
  const sends: Promise<boolean>[] = [];

  if (notice.familyEmail) {
    sends.push(
      deliver(notice.familyEmail, bookingForFamily(notice, `${url}/coaches`), {
        category: "coaching-booked",
        template: "coaching-booked",
        clientId: notice.clientId,
        sessionId: notice.sessionId,
      })
    );
  }
  if (notice.coachEmail) {
    sends.push(
      deliver(notice.coachEmail, bookingForCoach(notice, `${url}/coaches`), {
        category: "coaching-booked-coach",
        template: "coaching-booked-coach",
      })
    );
  }

  const results = await Promise.all(sends);
  return { sent: results.filter(Boolean).length, attempted: results.length };
}

/** A family called a session off. Same two people, opposite news. */
export async function notifyCoachingCancelled(sessionId: string): Promise<NotifyResult> {
  if (!isSupabaseConfigured() || !sessionId) return NOTHING;

  const notice = await readSessionNotice(sessionId);
  if (!notice) return NOTHING;

  const url = portalUrl();
  const sends: Promise<boolean>[] = [];

  if (notice.familyEmail) {
    sends.push(
      deliver(notice.familyEmail, cancellationForFamily(notice, `${url}/coaches`), {
        category: "coaching-cancelled",
        template: "coaching-cancelled",
        clientId: notice.clientId,
        sessionId: notice.sessionId,
      })
    );
  }
  if (notice.coachEmail) {
    sends.push(
      deliver(notice.coachEmail, cancellationForCoach(notice, `${url}/coaches`), {
        category: "coaching-cancelled-coach",
        template: "coaching-cancelled-coach",
      })
    );
  }

  const results = await Promise.all(sends);
  return { sent: results.filter(Boolean).length, attempted: results.length };
}

/**
 * A payment confirmed and the balance exists.
 *
 * Called from the Stripe webhook, which must answer 200 either way: a receipt
 * that failed to send is not a reason for Stripe to redeliver the payment
 * event, and redelivering it would credit nothing new anyway (portal 0154 is
 * idempotent).
 *
 * Only a PAID purchase is announced. The webhook already checks, but this
 * refuses again rather than trusting it, because "thank you, your sessions are
 * ready" sent for a purchase that never completed is the single worst message
 * in this file.
 */
export async function notifyCoachingPurchased(reference: string): Promise<NotifyResult> {
  if (!isSupabaseConfigured() || !reference) return NOTHING;

  const purchase = await readPurchaseNotice(reference);
  if (!purchase || purchase.status !== "paid") return NOTHING;

  const amount = formatCents(purchase.amountCents);
  const url = portalUrl();
  const sends: Promise<boolean>[] = [];

  if (purchase.familyEmail) {
    sends.push(
      deliver(purchase.familyEmail, receiptForFamily(purchase, `${url}/coaches`, amount), {
        category: "coaching-receipt",
        template: "coaching-receipt",
        clientId: purchase.clientId,
      })
    );
  }
  sends.push(
    deliver(officeEmail(), saleForOffice(purchase, amount), {
      category: "coaching-sold",
      template: "coaching-sold",
    })
  );

  const results = await Promise.all(sends);
  return { sent: results.filter(Boolean).length, attempted: results.length };
}
