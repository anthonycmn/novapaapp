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
  kind: "day_camp_credits",
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
