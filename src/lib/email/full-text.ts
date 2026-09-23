/**
 * The whole of an email, as a family reads it in the portal.
 *
 * Jeanette Ward, 22 Sep 2026: "we can see the message preview, but can't read
 * the entire message." A "We emailed you this" notification only ever held a
 * 160-character preview and pointed back at the notification list, so there
 * was nowhere in the portal to read the rest. The notification page now finds
 * the email it came from and shows all of it, through these two helpers.
 */

/**
 * An email body, which the office writes as plain text but may be HTML,
 * turned into text that keeps its paragraphs. Rendered with
 * `whitespace-pre-line`, never as HTML, so nothing in a body can run.
 */
export function emailBodyToText(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Which send a notification announced. The notification carries no send id
 * (it was never given one), so it is matched the way it was made: the same
 * subject, sent at most ten minutes before the notice was written. The latest
 * such send wins — the office sometimes presses Send twice.
 */
export function sendForNotice<T extends { subject: string; sentAt?: string | null }>(
  notice: { title: string; createdAt: string },
  sends: T[]
): T | undefined {
  const at = Date.parse(notice.createdAt);
  return sends
    .filter((s) => s.subject === notice.title && s.sentAt)
    .filter((s) => {
      const sent = Date.parse(s.sentAt as string);
      return sent <= at + 60_000 && at - sent <= 10 * 60_000;
    })
    .sort((a, b) => Date.parse(b.sentAt as string) - Date.parse(a.sentAt as string))[0];
}
