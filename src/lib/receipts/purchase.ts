import { org } from "@/config/org";
import { button, callout, esc, h2, p, renderEmailShell, section } from "@/lib/email/template";
import { formatCents } from "@/lib/format";
import { renderTextPdf, type PdfLine } from "./pdf";

/**
 * Anything bought inside the parent portal, said three ways.
 *
 * CJ, 24 Sep 2026: "Provide confirmation sales emails when ANYTHING is
 * purchased inside of the parent portal and send to Todd and CJ and then
 * provide a receipt in the parent's Family Vault."
 *
 * Three things are bought in the portal itself - a store order (spirit
 * buttons, star pages, lessons), a coaching package, and day camp days paid
 * for with credits the family already holds. Each has its own path to "paid";
 * all three end here, so the receipt, the sale email and the family's copy
 * read the same whichever door the money came through.
 *
 * Paid day camp days and packs are NOT in this list: they are bought on
 * novapa.org's checkout, which sends its own receipt, and the portal never
 * sees the payment.
 *
 * Pure: builds words and bytes, sends nothing. `record.ts` does the sending.
 */

export type PurchaseKind = "store" | "coaching" | "day_camp_credits";

export interface PurchaseLine {
  description: string;
  quantity: number;
  /** Per unit, in cents. Zero for a line paid with credits. */
  unitCents: number;
}

export interface PortalPurchase {
  kind: PurchaseKind;
  /** NPA-…, COACH-…, or the day camp hold id. Also the idempotency key. */
  reference: string;
  /** Hub family id - whose vault the receipt goes in. */
  familyId: string;
  familyName: string | null;
  /** Who pressed the button, when known. */
  buyerName: string | null;
  /** Where the family's copy goes. Null = no family email from here. */
  familyEmail: string | null;
  studentNames: string[];
  lines: PurchaseLine[];
  /** What was charged to a card. Zero for a credits booking. */
  totalCents: number;
  /** ISO timestamp of the payment. */
  paidAt: string;
  /** "Card (Stripe)", "3 day camp credits", … */
  paidWith: string;
  /** Stripe checkout session / payment id, for the office copy. */
  paymentRef: string | null;
}

const KIND_LABEL: Record<PurchaseKind, string> = {
  store: "Store order",
  coaching: "Coaching package",
  day_camp_credits: "Day camp booking",
};

/** "Sep 24, 2026, 2:05 PM" in Eastern time - the house clock. */
export function formatPaidAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";
}

function lineTotal(line: PurchaseLine): number {
  return line.unitCents * line.quantity;
}

function amountText(purchase: PortalPurchase, cents: number): string {
  return purchase.kind === "day_camp_credits" ? "credit" : formatCents(cents);
}

/** The vault's name for it. Carries the reference so a retry can find it. */
export function receiptDocumentName(purchase: PortalPurchase): string {
  return `Receipt - ${KIND_LABEL[purchase.kind]} ${purchase.reference}`;
}

/** Where the PDF lives in the family-documents bucket. Deterministic on purpose. */
export function receiptStoragePath(purchase: PortalPurchase): string {
  const safe = purchase.reference.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `${purchase.familyId}/receipts/${safe}.pdf`;
}

/** The receipt itself, as the family downloads it from the vault. */
export function renderReceiptPdf(purchase: PortalPurchase): Buffer {
  const t = org.tax;
  const lines: PdfLine[] = [
    { text: org.name, size: 18, bold: true },
    { text: t.legalName, size: 9, grey: 0.35 },
    { text: `${t.addressLine1}, ${t.addressLine2} · ${t.city}, ${t.state} ${t.zip}`, size: 9, grey: 0.35 },
    { text: `${t.phone} · ${org.supportEmail}`, size: 9, grey: 0.35, rule: true },
    { text: "RECEIPT", size: 14, bold: true, gapBefore: 14 },
    { text: `${KIND_LABEL[purchase.kind]} · Reference ${purchase.reference}`, size: 10, gapBefore: 4 },
    { text: `Paid ${formatPaidAt(purchase.paidAt)}`, size: 10 },
  ];
  if (purchase.familyName || purchase.buyerName) {
    lines.push({
      text: `Family: ${[purchase.familyName, purchase.buyerName].filter(Boolean).join(" - ")}`,
      size: 10,
    });
  }
  if (purchase.studentNames.length) {
    lines.push({ text: `Student${purchase.studentNames.length === 1 ? "" : "s"}: ${purchase.studentNames.join(", ")}`, size: 10 });
  }

  lines.push({ text: "Item", size: 10, bold: true, gapBefore: 16, rule: true });
  // The amount column shares the item's baseline: drawn as a second line with
  // a negative gap, which is how this tiny writer puts two runs on one row.
  lines.push({ text: "Amount", size: 10, bold: true, right: true, gapBefore: -13.5 });

  for (const line of purchase.lines.slice(0, 20)) {
    const qty = line.quantity > 1 ? `${line.quantity} × ` : "";
    lines.push({ text: `${qty}${line.description}`.slice(0, 80), size: 10, gapBefore: 4 });
    lines.push({ text: amountText(purchase, lineTotal(line)), size: 10, right: true, gapBefore: -13.5 });
  }

  lines.push({ text: "Total paid", size: 11, bold: true, gapBefore: 12, rule: false });
  lines.push({
    text: purchase.kind === "day_camp_credits" ? "$0.00" : formatCents(purchase.totalCents),
    size: 11,
    bold: true,
    right: true,
    gapBefore: -14.85,
  });
  lines.push({ text: `Paid with: ${purchase.paidWith}`, size: 10, gapBefore: 6 });

  lines.push({
    text: "Thank you. Keep this receipt for your records; it also lives in your Family Vault in the Parent Portal.",
    size: 9,
    grey: 0.35,
    gapBefore: 28,
  });
  lines.push({ text: `Questions: ${org.supportEmail}`, size: 9, grey: 0.35 });

  return renderTextPdf(lines, receiptDocumentName(purchase));
}

export interface Message {
  subject: string;
  text: string;
  html: string;
}

function itemList(purchase: PortalPurchase): string[] {
  return purchase.lines.map((line) => {
    const qty = line.quantity > 1 ? `${line.quantity} × ` : "";
    return `  ${qty}${line.description} - ${amountText(purchase, lineTotal(line))}`;
  });
}

function totalText(purchase: PortalPurchase): string {
  return purchase.kind === "day_camp_credits"
    ? purchase.paidWith
    : formatCents(purchase.totalCents);
}

/**
 * The sale, for CJ and Todd. Plain text, like every other office alert: it is
 * read on a phone between rehearsals, and the numbers are the whole message.
 */
export function saleConfirmationForOffice(purchase: PortalPurchase): Message {
  const who = purchase.familyName ?? purchase.buyerName ?? "A family";
  const subject = `Sale - ${KIND_LABEL[purchase.kind]} ${purchase.reference} · ${totalText(purchase)} (${who})`;
  const text = [
    `${who} bought this in the Parent Portal.`,
    "",
    ...itemList(purchase),
    "",
    `  Total:     ${totalText(purchase)}`,
    `  Paid with: ${purchase.paidWith}`,
    `  Paid:      ${formatPaidAt(purchase.paidAt)}`,
    `  Reference: ${purchase.reference}`,
    ...(purchase.paymentRef ? [`  Stripe:    ${purchase.paymentRef}`] : []),
    ...(purchase.studentNames.length ? [`  For:       ${purchase.studentNames.join(", ")}`] : []),
    ...(purchase.buyerName ? [`  Bought by: ${purchase.buyerName}${purchase.familyEmail ? ` <${purchase.familyEmail}>` : ""}`] : []),
    "",
    "A receipt has been filed in the family's Family Vault.",
  ].join("\n");
  return { subject, text, html: "" };
}

function greeting(name: string | null): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hello,";
}

/**
 * The family's confirmation. Only the store sends this one: coaching already
 * has its own receipt email (notices.ts), and a credits booking is confirmed
 * by the registration system's email - two confirmations of one purchase read
 * like two charges.
 */
export function purchaseConfirmationForFamily(purchase: PortalPurchase, vaultUrl: string): Message {
  const subject = `Order confirmed - ${purchase.reference}`;
  const items = purchase.lines
    .map((line) => {
      const qty = line.quantity > 1 ? `${line.quantity} × ` : "";
      return `${esc(qty + line.description)} - ${esc(amountText(purchase, lineTotal(line)))}`;
    })
    .join("<br>");

  const html = renderEmailShell({
    preheader: `Your ${org.shortName} order ${purchase.reference} is paid.`,
    content: [
      section(
        h2("Thank you - your order is confirmed") +
          p(esc(greeting(purchase.buyerName))) +
          p(`Your payment went through. Here is what you bought:`),
        { first: true }
      ),
      section(
        callout(
          `${items}<br><br><strong>Total paid: ${esc(formatCents(purchase.totalCents))}</strong><br>Reference ${esc(purchase.reference)} · ${esc(formatPaidAt(purchase.paidAt))}`
        )
      ),
      section(
        p("A receipt is saved in your Family Vault, under Financial / receipts.") +
          button("Open your Family Vault", vaultUrl) +
          p("Reply to this email and it reaches the office directly.")
      ),
    ].join(""),
  });

  const text = [
    greeting(purchase.buyerName),
    "",
    "Your payment went through. Here is what you bought:",
    "",
    ...itemList(purchase),
    "",
    `  Total paid: ${formatCents(purchase.totalCents)}`,
    `  Reference:  ${purchase.reference}`,
    `  Paid:       ${formatPaidAt(purchase.paidAt)}`,
    "",
    `A receipt is saved in your Family Vault: ${vaultUrl}`,
    "",
    "Reply to this email and it reaches the office directly.",
  ].join("\n");

  return { subject, text, html };
}
