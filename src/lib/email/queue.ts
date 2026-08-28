/**
 * Delivery for scheduled email.
 *
 * **The bug this closes.** The composer has offered a "Schedule (optional)"
 * field since the email feature shipped. `sendEmailAction` wrote the chosen
 * time to `email_sends.scheduled_for` and then skipped delivery:
 *
 *     if (!scheduledFor || mode === "test") { …deliver… }
 *
 * Nothing anywhere read that column back. There was no worker, no cron entry,
 * no queue — a scheduled email was a database row that would never be sent,
 * and the admin list cheerfully rendered it as "Scheduled 30 Aug, 9:00 AM".
 * The failure is silent and total, and it only stayed invisible because no
 * email had ever been sent from this system at all (`email_sends` was empty
 * until today).
 *
 * This module is the missing half: find sends whose time has come, deliver
 * them, and stamp `sent_at` so they go exactly once.
 *
 * **Exactly once** is the part worth caring about. The worker runs on a
 * schedule, so two runs can overlap, and a rehearsal call sent twice reads as
 * a schedule change to a parent skimming on a phone. `claimDueSends` stamps
 * `sent_at` *before* delivering, conditional on it still being null, and only
 * proceeds for rows the update actually claimed. A crash mid-batch therefore
 * drops a send rather than repeating it — the safer direction, and a dropped
 * send is visible in the admin list as one with no open count.
 */
import { getEmailDeliveryProvider, resolveMergeFields } from "@/lib/api/email";
import { instrumentEmailBody } from "@/lib/api/email/tracking";
import type { EmailSend, FeedAudience, User } from "@/lib/api/types";

export interface QueueProvider {
  /** Sends that are due: scheduled_for <= now and sent_at is null. */
  claimDueSends(now: string): Promise<EmailSend[]>;
  resolveAudience(actorId: string, audience: FeedAudience): Promise<User[]>;
  markSendFailed(sendId: string, reason: string): Promise<void>;
  recordSendStats(sendId: string, delivered: number): Promise<void>;
}

export interface QueueResult {
  claimed: number;
  delivered: number;
  failed: number;
}

/** A body is HTML when it opens like a document; the composer stores either. */
export function looksLikeHtml(body: string): boolean {
  return /^\s*<(?:!doctype|html|table|div|p\b)/i.test(body);
}

/**
 * Plain-text fallback for an HTML body. Crude by design: a real converter is
 * a dependency we do not need, and this only has to be readable, since every
 * client that can render HTML will.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * The text/html pair for a body that may be either.
 *
 * Three paths deliver email — the composer's immediate send, the staff
 * portal's POST /api/email/send, and this queue — and each has to make the
 * same decision about a body. Making it once, here, is what stops an HTML
 * email rendering properly on one path and arriving as raw markup on
 * another, which is exactly how the other two behaved until the queue was
 * written and only this one learned to set `html`.
 */
export function outgoingBody(
  rawBody: string,
  instrumented: string
): { text: string; html?: string } {
  return looksLikeHtml(rawBody)
    ? { text: htmlToText(instrumented), html: instrumented }
    : { text: instrumented };
}

/**
 * Deliver every send whose time has come.
 *
 * `origin` is needed because open/click tracking rewrites links against an
 * absolute base, and a cron run has no request to read a Host header from.
 */
export async function runEmailQueue(
  provider: QueueProvider,
  actorId: string,
  origin: string,
  now: string = new Date().toISOString()
): Promise<QueueResult> {
  const due = await provider.claimDueSends(now);
  const result: QueueResult = { claimed: due.length, delivered: 0, failed: 0 };
  if (!due.length) return result;

  const delivery = getEmailDeliveryProvider();

  for (const send of due) {
    try {
      const recipients = await provider.resolveAudience(actorId, send.audience);
      let delivered = 0;

      for (const recipient of recipients) {
        const context = {
          parent_first: recipient.displayName.split(" ")[0],
          sender_name: send.createdByName,
        };
        // Merge first, then instrument — a merge field that resolves to a URL
        // must still get a tracking wrapper.
        const merged = resolveMergeFields(send.body, context);
        const instrumented = instrumentEmailBody(
          merged,
          { sendId: send.id, recipientId: recipient.id },
          origin
        );
        const outcome = await delivery.send({
          to: recipient.email,
          subject: resolveMergeFields(send.subject, context),
          ...outgoingBody(send.body, instrumented),
          category: send.category,
        });
        if (outcome.ok) delivered += 1;
      }

      await provider.recordSendStats(send.id, delivered);
      result.delivered += delivered;
    } catch (error) {
      result.failed += 1;
      await provider.markSendFailed(
        send.id,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  return result;
}
