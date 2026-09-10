import { beforeEach, describe, expect, it } from "vitest";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import {
  CONFIRMATION_CODE_PATTERN,
  makeConfirmationCode,
} from "@/lib/auditions/confirmation-code";
import { auditionReceiptForFamily } from "@/lib/api/auditions/notices";

/**
 * The receipt a family gets for an audition — CJ, 8 Sep 2026.
 *
 * The rules: every submission gets a code, the code is unambiguous to read
 * aloud, an edit keeps the code it was given, and the email says the three
 * things it was asked to say.
 */

const provider = new MockDataProvider();

const submission = {
  studentId: "stu-ava",
  productionId: "prod-frozen",
  preferenceTiers: ["lead" as const],
  previousRoles: "Young Anna (2025)",
  hopes: "Confidence and new friends",
  acknowledgedNoGuarantee: true,
};

beforeEach(() => {
  resetMockStore();
});

describe("confirmation code", () => {
  it("looks like AUD-XXXX-XXXX and avoids the letters people mishear", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = makeConfirmationCode();
      expect(code).toMatch(CONFIRMATION_CODE_PATTERN);
      expect(code).not.toMatch(/[01ILOS589]/);
    }
  });

  it("is minted on first submission and kept through an edit", async () => {
    const first = await provider.submitAuditionProfile("user-sofia", submission);
    expect(first.confirmationCode).toMatch(CONFIRMATION_CODE_PATTERN);
    expect(first.submittedAt).toBeTruthy();

    const edited = await provider.submitAuditionProfile("user-sofia", {
      ...submission,
      preferenceTiers: ["ensemble"],
    });
    expect(edited.confirmationCode).toBe(first.confirmationCode);
    expect(edited.submittedAt).toBe(first.submittedAt);
  });
});

describe("the receipt email", () => {
  const receipt = {
    studentName: "Ava",
    productionTitle: "Frozen Jr.",
    confirmationCode: "AUD-K7MP-QX2W",
    isUpdate: false,
    auditionUrl: "https://portal.novapa.org/auditions/prod-frozen/stu-ava",
  };

  it("says submitted, thank you, and that the staff will review it", () => {
    const message = auditionReceiptForFamily(receipt);
    expect(message.subject).toContain("Audition submitted");
    expect(message.text).toContain("has been submitted");
    expect(message.text).toContain("Thank you. The staff will review it shortly.");
    expect(message.text).toContain("AUD-K7MP-QX2W");
    expect(message.html).toContain("AUD-K7MP-QX2W");
    expect(message.html).toContain(receipt.auditionUrl);
  });

  it("says updated when the form had already gone through", () => {
    const message = auditionReceiptForFamily({ ...receipt, isUpdate: true });
    expect(message.subject).toContain("Audition updated");
    expect(message.text).toContain("has been updated");
    expect(message.text).toContain("AUD-K7MP-QX2W");
  });
});
