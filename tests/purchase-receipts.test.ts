import { describe, expect, it } from "vitest";
import { PURCHASE_RECIPIENTS } from "@/config/submission-recipients";
import {
  purchaseConfirmationForFamily,
  receiptDocumentName,
  receiptStoragePath,
  renderReceiptPdf,
  saleConfirmationForOffice,
  type PortalPurchase,
} from "@/lib/receipts/purchase";
import { renderTextPdf } from "@/lib/receipts/pdf";
import {
  dayCampPurchaseFromOrder,
  formatCampDate,
  isDayCampItem,
  type ActivityFacts,
  type WebsiteOrderRow,
} from "@/lib/receipts/day-camp-order";

/**
 * CJ, 24 Sep 2026: every purchase in the parent portal emails CJ and Todd and
 * leaves a receipt in the family's vault. What is pinned here is what would be
 * wrong in a way somebody notices: the wrong inbox, a receipt the vault cannot
 * open, a credits booking that claims money changed hands.
 */

const STORE: PortalPurchase = {
  kind: "store",
  reference: "NPA-1042",
  familyId: "fam-1",
  familyName: "The Rivera Family",
  buyerName: "Maria Rivera",
  familyEmail: "maria@example.com",
  studentNames: ["Sofia Rivera"],
  lines: [
    { description: "Sofia Rivera — Mrs. Lovett (3\" button) · Broadway Bound", quantity: 2, unitCents: 800 },
    { description: "Star page — half page", quantity: 1, unitCents: 2500 },
  ],
  totalCents: 4100,
  paidAt: "2026-09-24T18:05:00Z",
  paidWith: "Card (Stripe)",
  paymentRef: "cs_test_123",
};

const CREDITS: PortalPurchase = {
  ...STORE,
  kind: "day_camp",
  reference: "7c0c3a3e-1111-4222-8333-944445555666",
  lines: [{ description: "Day Camp (5–9) — Mon Oct 12", quantity: 1, unitCents: 0 }],
  totalCents: 0,
  paidWith: "1 day camp credit (4 left)",
  paymentRef: null,
};

describe("who hears about a sale", () => {
  it("is CJ and Todd, and nobody else", () => {
    expect(PURCHASE_RECIPIENTS.map((r) => r.email).sort()).toEqual([
      "cj@novapa.org",
      "todd@novapa.org",
    ]);
  });
});

describe("the office copy", () => {
  it("names the reference, the total and the family", () => {
    const message = saleConfirmationForOffice(STORE);
    expect(message.subject).toContain("NPA-1042");
    expect(message.subject).toContain("$41.00");
    expect(message.subject).toContain("The Rivera Family");
    expect(message.text).toContain("2 × Sofia Rivera");
    expect(message.text).toContain("cs_test_123");
    expect(message.text).toContain("Family Vault");
  });

  it("does not put a dollar amount on a credits booking", () => {
    const message = saleConfirmationForOffice(CREDITS);
    expect(message.subject).toContain("1 day camp credit");
    expect(message.text).not.toMatch(/\$0\.00/);
  });
});

describe("the family's confirmation", () => {
  it("links to the vault and escapes what the family typed", () => {
    const message = purchaseConfirmationForFamily(
      { ...STORE, lines: [{ description: "<b>Sofia</b>", quantity: 1, unitCents: 4100 }] },
      "https://portal.novapa.org/family/documents"
    );
    expect(message.subject).toBe("Order confirmed - NPA-1042");
    expect(message.html).toContain("https://portal.novapa.org/family/documents");
    expect(message.html).not.toContain("<b>Sofia</b>");
    expect(message.text).toContain("Hi Maria,");
  });
});

describe("the vault receipt", () => {
  it("is a well-formed PDF the vault will take", () => {
    const pdf = renderReceiptPdf(STORE);
    const body = pdf.toString("latin1");
    expect(body.startsWith("%PDF-1.4")).toBe(true);
    expect(body.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(body).toContain("(NPA-1042)".slice(1, -1));
    expect(body).toContain("$41.00");
    // The xref offset points at the xref table.
    const startxref = Number(/startxref\n(\d+)/.exec(body)![1]);
    expect(body.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("encodes an em dash as one WinAnsi byte, and escapes parentheses", () => {
    const body = renderTextPdf([{ text: "A — (B)" }], "t").toString("latin1");
    expect(body).toContain("(A \x97 \\(B\\))");
  });

  it("files under a path and name derived from the reference, so a retry finds it", () => {
    expect(receiptStoragePath(STORE)).toBe("fam-1/receipts/NPA-1042.pdf");
    expect(receiptStoragePath(STORE)).toBe(receiptStoragePath({ ...STORE }));
    expect(receiptDocumentName(STORE)).toContain("NPA-1042");
    expect(receiptStoragePath({ ...STORE, reference: "../../x y" })).not.toContain("..");
  });
});

describe("a novapa.org day camp order", () => {
  const activities = new Map<number, ActivityFacts>([
    [1962598, { name: "Heroes & Villains", offeringKind: "day_camp", startsOn: "2026-09-21" }],
    [555, { name: "Frozen JR.", offeringKind: "show", startsOn: "2027-01-29" }],
  ]);
  const paid: WebsiteOrderRow = {
    id: "948d3c05-c3d3-4dbc-a694-3888fd94b509",
    order_no: 15255,
    email: "parent@example.com",
    parent_name: "Cheryl Nebhut",
    status: "paid",
    total_cents: 15405,
    amount_today_cents: 15405,
    installments_paid_cents: 0,
    stripe_payment_intent: "pi_3UGRm",
    created_at: "2026-09-16T23:03:30Z",
  };

  it("counts days and packs, and nothing else", () => {
    expect(isDayCampItem({ camper_name: "A", unit_price_cents: 7900, activity_id: 1962598 }, activities)).toBe(true);
    expect(isDayCampItem({ camper_name: "A", unit_price_cents: 34900, activity_id: 990010 }, activities)).toBe(true);
    expect(isDayCampItem({ camper_name: "A", unit_price_cents: 30000, activity_id: 555 }, activities)).toBe(false);
  });

  it("reads the date without a time zone moving it a day", () => {
    expect(formatCampDate("2026-10-12")).toBe("Mon, Oct 12, 2026");
  });

  it("is the order number, each child's line at its own price, and what was paid", () => {
    const receipt = dayCampPurchaseFromOrder({
      order: paid,
      items: [
        { camper_name: "Olivia Nebhut", unit_price_cents: 7900, activity_id: 1962598 },
        { camper_name: "Isabelle Nebhut", unit_price_cents: 7505, activity_id: 1962598 },
      ],
      activities,
      familyId: "fam-9",
      familyName: "Nebhut Family",
      creditsRedeemed: null,
    });
    expect(receipt.reference).toBe("REG-15255");
    expect(receipt.lines.map((l) => l.description)).toEqual([
      "Heroes & Villains, Mon, Sep 21, 2026 - Olivia Nebhut",
      "Heroes & Villains, Mon, Sep 21, 2026 - Isabelle Nebhut",
    ]);
    expect(receipt.totalCents).toBe(15405);
    expect(receipt.paidWith).toBe("Card (Stripe)");
    expect(receipt.studentNames).toEqual(["Olivia Nebhut", "Isabelle Nebhut"]);
  });

  it("says credits, not dollars, for a credit booking", () => {
    const receipt = dayCampPurchaseFromOrder({
      order: { ...paid, total_cents: 0, amount_today_cents: 0, stripe_payment_intent: "free_d2c0" },
      items: [{ camper_name: "Cora Kouhsari", unit_price_cents: 7900, activity_id: 1962598 }],
      activities,
      familyId: "fam-9",
      familyName: null,
      creditsRedeemed: 1,
    });
    expect(receipt.totalCents).toBe(0);
    expect(receipt.paidWith).toBe("1 day camp credit");
    expect(receipt.lines[0].unitCents).toBe(0);
    expect(renderReceiptPdf(receipt).toString("latin1")).toContain("(credit)");
  });
});
