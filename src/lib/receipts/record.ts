import "server-only";
import { org } from "@/config/org";
import { PURCHASE_RECIPIENTS } from "@/config/submission-recipients";
import { getProvider } from "@/lib/api";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { getStorageProvider } from "@/lib/api/storage";
import {
  getPortalReadClient,
  getServiceClient,
  isSupabaseConfigured,
} from "@/lib/api/supabase/client";
import { isButtonLine, type ButtonOrder } from "@/lib/api/types";
import { describeButton } from "@/lib/api/payments";
import {
  purchaseConfirmationForFamily,
  receiptDocumentName,
  receiptStoragePath,
  renderReceiptPdf,
  saleConfirmationForOffice,
  type PortalPurchase,
} from "./purchase";

/**
 * File the receipt, tell CJ and Todd, and (for the store) tell the family.
 * Day camp orders from novapa.org come through registration-orders.ts.
 *
 * ---------------------------------------------------------------------------
 * CALLED AFTER THE MONEY MOVED, SO IT NEVER THROWS
 * ---------------------------------------------------------------------------
 * Every caller has already taken the payment or spent the credit. A vault that
 * is briefly unreachable or a mail provider that says no is not a reason to
 * show a family a red box, or for Stripe to redeliver a paid session. So this
 * returns a tally and swallows everything, logging what it could not do.
 *
 * ---------------------------------------------------------------------------
 * ONCE PER PURCHASE
 * ---------------------------------------------------------------------------
 * Stripe retries webhooks. The receipt's storage path is derived from the
 * purchase reference, so the vault row IS the "already done" marker: if it
 * exists, nothing is filed or sent again. A family emailed "order confirmed"
 * three times reasonably wonders if they were charged three times.
 */

export interface RecordResult {
  filed: boolean;
  alreadyRecorded: boolean;
  emailsSent: number;
  emailsAttempted: number;
}

function portalUrl(): string {
  return process.env.URL ?? "https://portal.novapa.org";
}

function isSupabaseMode(): boolean {
  return (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase" && isSupabaseConfigured();
}

async function alreadyFiled(purchase: PortalPurchase, mockActorId?: string): Promise<boolean> {
  if (isSupabaseMode()) {
    const { data } = await getServiceClient()
      .from("family_documents")
      .select("id")
      .eq("family_id", purchase.familyId)
      .eq("storage_path", receiptStoragePath(purchase))
      .limit(1);
    return Boolean(data?.length);
  }
  if (!mockActorId) return false;
  const docs = await getProvider().getFamilyDocuments(mockActorId, purchase.familyId);
  return docs.some((doc) => doc.name === receiptDocumentName(purchase));
}

async function fileReceipt(purchase: PortalPurchase, mockActorId?: string): Promise<boolean> {
  const pdf = renderReceiptPdf(purchase);
  const dataUrl = `data:application/pdf;base64,${pdf.toString("base64")}`;

  if (isSupabaseMode()) {
    const stored = await getStorageProvider().upload(
      "family-documents",
      receiptStoragePath(purchase),
      dataUrl
    );
    const { error } = await getServiceClient().from("family_documents").insert({
      family_id: purchase.familyId,
      student_id: null,
      name: receiptDocumentName(purchase),
      category: "financial",
      file_url: stored.url,
      storage_path: stored.path,
      content_type: "application/pdf",
      size_bytes: stored.sizeBytes,
      uploaded_by_name: org.name,
      uploaded_by_staff: true,
    });
    if (error) throw new Error(`receipt row failed: ${error.message}`);
    return true;
  }

  // Mock mode: the buyer's own session files it, which the mock allows.
  if (!mockActorId) return false;
  await getProvider().uploadFamilyDocument(mockActorId, purchase.familyId, {
    name: receiptDocumentName(purchase),
    category: "financial",
    source: { kind: "dataUrl", dataUrl },
  });
  return true;
}

async function send(to: string, message: { subject: string; text: string; html: string }, category: string) {
  try {
    const result = await getEmailDeliveryProvider().send({
      to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      category,
      replyTo: org.supportEmail,
    });
    return result.ok;
  } catch (error) {
    console.error(`receipts: ${category} to ${to} failed`, error);
    return false;
  }
}

/**
 * The one entry point. `mockActorId` is the signed-in buyer, used only in mock
 * mode where there is no service client to file with.
 */
export async function recordPortalPurchase(
  purchase: PortalPurchase,
  options: { mockActorId?: string; notify?: boolean } = {}
): Promise<RecordResult> {
  const result: RecordResult = { filed: false, alreadyRecorded: false, emailsSent: 0, emailsAttempted: 0 };

  try {
    if (await alreadyFiled(purchase, options.mockActorId)) {
      result.alreadyRecorded = true;
      return result;
    }
  } catch (error) {
    // Could not check - carry on. A rare duplicate beats a missing receipt.
    console.error("receipts: could not check for an existing receipt", error);
  }

  try {
    result.filed = await fileReceipt(purchase, options.mockActorId);
  } catch (error) {
    console.error(`receipts: filing ${purchase.reference} in the vault failed`, error);
  }

  // A backfill files the receipt and tells nobody: the sale is days old.
  if (options.notify === false) return result;

  const sends: Promise<boolean>[] = [];
  const sale = saleConfirmationForOffice(purchase);
  for (const recipient of PURCHASE_RECIPIENTS) {
    sends.push(send(recipient.email, sale, "portal-sale"));
  }
  if (purchase.kind === "store" && purchase.familyEmail) {
    sends.push(
      send(
        purchase.familyEmail,
        purchaseConfirmationForFamily(purchase, `${portalUrl()}/family/documents`),
        "portal-order-confirmed"
      )
    );
  }
  const outcomes = await Promise.all(sends);
  result.emailsAttempted = outcomes.length;
  result.emailsSent = outcomes.filter(Boolean).length;
  return result;
}

/**
 * Replace a filed receipt's PDF in place: same path, same vault row, new
 * bytes. For correcting how a receipt reads, never for a new purchase.
 */
export async function refileReceipt(purchase: PortalPurchase): Promise<boolean> {
  if (!isSupabaseMode()) return false;
  const pdf = renderReceiptPdf(purchase);
  const stored = await getStorageProvider().upload(
    "family-documents",
    receiptStoragePath(purchase),
    `data:application/pdf;base64,${pdf.toString("base64")}`
  );
  const { data, error } = await getServiceClient()
    .from("family_documents")
    .update({ size_bytes: stored.sizeBytes, name: receiptDocumentName(purchase) })
    .eq("family_id", purchase.familyId)
    .eq("storage_path", receiptStoragePath(purchase))
    .select("id");
  if (error) throw new Error(`receipt row update failed: ${error.message}`);
  return Boolean(data?.length);
}

/* ── the three doors ─────────────────────────────────────────────────── */

export async function familyContact(
  familyId: string,
  preferredName: string | null
): Promise<{ familyName: string | null; email: string | null; buyerName: string | null }> {
  if (!isSupabaseMode()) return { familyName: null, email: null, buyerName: preferredName };
  const db = getServiceClient();
  const [{ data: family }, { data: parents }] = await Promise.all([
    db.from("families").select("name").eq("id", familyId).maybeSingle(),
    db.from("profiles").select("email, display_name").eq("family_id", familyId).eq("role", "parent").order("created_at"),
  ]);
  const list = (parents ?? []) as { email: string | null; display_name: string | null }[];
  const buyer =
    list.find((p) => preferredName && p.display_name?.trim() === preferredName.trim()) ?? list[0];
  return {
    familyName: (family as { name?: string } | null)?.name ?? null,
    email: buyer?.email ?? null,
    buyerName: preferredName ?? buyer?.display_name ?? null,
  };
}

/** A store order Stripe (or the mock processor) just marked paid. */
export async function recordStoreOrderPaid(
  order: ButtonOrder,
  options: { mockActorId?: string; buyerEmail?: string; notify?: boolean } = {}
): Promise<RecordResult | null> {
  try {
    const contact = await familyContact(order.familyId, order.placedByName || null);
    const students = new Set<string>();
    const lines = order.items.map((item) => {
      const student = item.studentName ?? (item.customization && "studentName" in item.customization ? item.customization.studentName : undefined);
      if (student) students.add(student);
      return {
        description: isButtonLine(item) ? describeButton(item.studentName, item.role, item.size) : item.displayName,
        quantity: item.quantity,
        unitCents: item.unitPriceCents,
      };
    });
    return await recordPortalPurchase(
      {
        kind: "store",
        reference: order.reference,
        familyId: order.familyId,
        familyName: contact.familyName,
        buyerName: contact.buyerName,
        familyEmail: options.buyerEmail ?? contact.email,
        studentNames: [...students],
        lines,
        totalCents: order.subtotalCents,
        paidAt: order.paidAt ?? new Date().toISOString(),
        paidWith: "Card (Stripe)",
        paymentRef: order.paymentRef || null,
      },
      { mockActorId: options.mockActorId, notify: options.notify }
    );
  } catch (error) {
    console.error(`receipts: store order ${order.reference} not recorded`, error);
    return null;
  }
}

/** A coaching package the webhook just credited. Reads the purchase row itself. */
export async function recordCoachingPurchasePaid(
  reference: string,
  options: { notify?: boolean } = {}
): Promise<RecordResult | null> {
  if (!isSupabaseMode()) return null;
  try {
    const { data, error } = await getPortalReadClient()
      .from("coaching_purchases")
      .select("reference, family_id, student_id, service, sessions, amount_cents, status, paid_at, payment_ref")
      .eq("reference", reference)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as {
      family_id: string | null; student_id: string | null; service: string; sessions: number;
      amount_cents: number; status: string; paid_at: string | null; payment_ref: string | null;
    };
    if (row.status !== "paid" || !row.family_id) return null;

    const db = getServiceClient();
    const { data: student } = row.student_id
      ? await db.from("students").select("first_name, last_name, preferred_name").eq("id", row.student_id).maybeSingle()
      : { data: null };
    const s = student as { first_name?: string; last_name?: string; preferred_name?: string | null } | null;
    const studentName = s ? `${s.preferred_name?.trim() || s.first_name} ${s.last_name}`.trim() : null;
    const contact = await familyContact(row.family_id, null);

    return await recordPortalPurchase({
      kind: "coaching",
      reference,
      familyId: row.family_id,
      familyName: contact.familyName,
      buyerName: contact.buyerName,
      familyEmail: contact.email,
      studentNames: studentName ? [studentName] : [],
      lines: [{
        description: `${row.service} - ${row.sessions} session${row.sessions === 1 ? "" : "s"}`,
        quantity: 1,
        unitCents: row.amount_cents,
      }],
      totalCents: row.amount_cents,
      paidAt: row.paid_at ?? new Date().toISOString(),
      paidWith: "Card (Stripe)",
      paymentRef: row.payment_ref,
    }, { notify: options.notify });
  } catch (error) {
    console.error(`receipts: coaching ${reference} not recorded`, error);
    return null;
  }
}
