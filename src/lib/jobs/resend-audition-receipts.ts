import "server-only";
import { logActivity } from "@/lib/activity";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { org } from "@/config/org";
import { auditionReceiptForFamily } from "@/lib/api/auditions/notices";
import { auditionUrl } from "@/lib/api/auditions/notify";
import { getServiceClient } from "@/lib/api/supabase/client";
import { p } from "@/lib/email/template";

/**
 * Send the audition receipts that never went.
 *
 * Why, 13 Sep 2026: the parent portal's Netlify site had no RESEND_API_KEY —
 * the website and staff portal each had one, this site never did — so every
 * receipt since the receipt shipped stayed in the building. Up to the morning
 * of 11 Sep the mock adapter also reported them sent (567cba6 stopped that),
 * which is why Isabel Sok had a confirmation code and no email on 10 Sep.
 *
 * One receipt per child per show, not one per save: a family that edited
 * three times gets one mail with the code they hold now, read from
 * audition_profiles rather than the log. Each send is written to the
 * play-by-play as `audition.receipt_resent`, and a child+show that already
 * has a successful one is skipped, so running this twice sends nothing twice.
 * The mail is the ordinary receipt with one paragraph on top saying it is
 * late and why, because a bare "submitted" three days on reads as "did I
 * submit again?".
 */

const RESENT = "audition.receipt_resent";
const SUBMITTED = ["audition.profile_submitted", "audition.profile_updated"];

export interface ResendReceiptRow {
  email: string;
  studentId: string;
  productionId: string;
  studentName: string;
  productionTitle: string;
  confirmationCode: string;
  lastSubmittedAt: string;
}

export interface ResendReceiptsResult {
  dry: boolean;
  since: string;
  candidates: number;
  skipped: number;
  sent: number;
  failed: number;
  rows: (ResendReceiptRow & { outcome: "sent" | "failed" | "skipped" | "would-send" })[];
}

const LATE_NOTE_TEXT =
  "This receipt is arriving late: our confirmation emails were not going out between " +
  "September 10 and September 13. Nothing about the audition itself was affected - it was " +
  "saved the moment you submitted it, and the staff have it. Sorry for the worry.";

export async function resendAuditionReceipts(options: {
  /** ISO instant; submissions at or after this are candidates. */
  since?: string;
  /** List what would go without sending anything. */
  dry?: boolean;
} = {}): Promise<ResendReceiptsResult> {
  const since = options.since ?? "2026-09-10T04:00:00Z";
  const dry = Boolean(options.dry);
  const db = getServiceClient();

  const { data: log, error } = await db
    .from("activity_log")
    .select("actor_email, student_id, action, detail, occurred_at")
    .in("action", [...SUBMITTED, RESENT])
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });
  if (error) throw new Error(`activity_log: ${error.message}`);

  // Latest submission per child+show, and the set already resent successfully.
  const latest = new Map<string, { email: string; studentId: string; productionId: string; at: string }>();
  const done = new Set<string>();
  for (const row of log ?? []) {
    const detail = (row.detail ?? {}) as Record<string, unknown>;
    const productionId = typeof detail.productionId === "string" ? detail.productionId : null;
    if (!row.student_id || !productionId) continue;
    const key = `${row.student_id}:${productionId}`;
    if (row.action === RESENT) {
      if (detail.receiptEmailed === true) done.add(key);
      continue;
    }
    if (!row.actor_email) continue;
    latest.set(key, {
      email: String(row.actor_email).toLowerCase(),
      studentId: String(row.student_id),
      productionId,
      at: String(row.occurred_at),
    });
  }

  const studentIds = [...new Set([...latest.values()].map((v) => v.studentId))];
  const productionIds = [...new Set([...latest.values()].map((v) => v.productionId))];
  const [students, productions, profiles] = await Promise.all([
    db.from("students").select("id, first_name, preferred_name").in("id", studentIds),
    db.from("productions").select("id, title").in("id", productionIds),
    db
      .from("audition_profiles")
      .select("student_id, production_id, confirmation_code")
      .in("student_id", studentIds),
  ]);
  for (const r of [students, productions, profiles]) {
    if (r.error) throw new Error(r.error.message);
  }
  const studentName = new Map(
    (students.data ?? []).map((s) => [String(s.id), String(s.preferred_name || s.first_name)])
  );
  const productionTitle = new Map((productions.data ?? []).map((p) => [String(p.id), String(p.title)]));
  const code = new Map(
    (profiles.data ?? []).map((a) => [`${a.student_id}:${a.production_id}`, String(a.confirmation_code ?? "")])
  );

  const result: ResendReceiptsResult = {
    dry,
    since,
    candidates: latest.size,
    skipped: 0,
    sent: 0,
    failed: 0,
    rows: [],
  };

  for (const [key, entry] of latest) {
    const row: ResendReceiptRow = {
      email: entry.email,
      studentId: entry.studentId,
      productionId: entry.productionId,
      studentName: studentName.get(entry.studentId) ?? "Your performer",
      productionTitle: productionTitle.get(entry.productionId) ?? "the show",
      confirmationCode: code.get(key) ?? "",
      lastSubmittedAt: entry.at,
    };
    if (done.has(key) || !row.confirmationCode) {
      result.skipped += 1;
      result.rows.push({ ...row, outcome: "skipped" });
      continue;
    }
    if (dry) {
      result.rows.push({ ...row, outcome: "would-send" });
      continue;
    }

    const message = auditionReceiptForFamily({
      studentName: row.studentName,
      productionTitle: row.productionTitle,
      confirmationCode: row.confirmationCode,
      isUpdate: false,
      auditionUrl: auditionUrl(row.productionId, row.studentId),
    });
    const text = `${LATE_NOTE_TEXT}\n\n${message.text}`;
    // The note goes inside the card, ahead of the headline.
    const html = message.html.replace("<h2", `${p(`<em>${LATE_NOTE_TEXT}</em>`)}<h2`);

    let ok = false;
    try {
      ok = (
        await getEmailDeliveryProvider().send({
          to: row.email,
          subject: message.subject,
          text,
          html,
          category: "auditions",
          replyTo: org.supportEmail,
        })
      ).ok;
    } catch (error) {
      console.error("resend-audition-receipts", row.email, error);
    }
    await logActivity({
      actorEmail: row.email,
      action: RESENT,
      summary: `${ok ? "Was sent" : "Could not be sent"} the audition receipt for ${row.studentName} - ${row.productionTitle} (late, after the mail key was set)`,
      studentId: row.studentId,
      detail: {
        productionId: row.productionId,
        confirmationCode: row.confirmationCode,
        receiptEmailed: ok,
        late: true,
      },
    });
    if (ok) result.sent += 1;
    else result.failed += 1;
    result.rows.push({ ...row, outcome: ok ? "sent" : "failed" });
  }

  return result;
}
