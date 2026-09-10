import { afterEach, describe, expect, it } from "vitest";
import { emailDeliveryStatus } from "@/lib/api/email";

/**
 * A deployment that cannot send email has to say so.
 *
 * Isabel Sok, a parent, 10 Sep 2026: "no confirmation email has been sent
 * after submission (I have a confirmation # but no email was sent)."
 *
 * She was right, and every instrument we had said otherwise. With no
 * RESEND_API_KEY the provider fell back to the mock, whose job is to answer
 * `ok: true` and write a line to a log — so the activity record for every
 * audition since the receipt shipped reads `receiptEmailed: true`, and the
 * confirmation page told each family "we've emailed a copy". A parent had to
 * notice for us.
 *
 * The second case is quieter and would have been next: a key present, no
 * EMAIL_FROM_ADDRESS, so mail goes out from Resend's shared testing sender —
 * which Resend delivers only to the account owner's own inbox. That one
 * genuinely sends, gets a 200, and still reaches nobody.
 */

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM_ADDRESS"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("whether this deployment can reach a family", () => {
  it("says no, and why, when the key is missing", () => {
    delete process.env.RESEND_API_KEY;
    const status = emailDeliveryStatus();
    expect(status.ok).toBe(false);
    // The reason has to name the trap: on Netlify a variable marked "secret"
    // is not readable at function runtime, which is how a key that is plainly
    // "set" in the dashboard is missing here.
    expect(status.reason).toMatch(/secret/i);
  });

  it("says no when mail would go out as onboarding@resend.dev", () => {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.EMAIL_FROM_ADDRESS;
    const status = emailDeliveryStatus();
    expect(status.ok).toBe(false);
    expect(status.reason).toMatch(/resend\.dev/);
  });

  it("says yes only when both are set", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM_ADDRESS = "NOVA PA <noreply@novapa.org>";
    expect(emailDeliveryStatus()).toEqual({ ok: true });
  });
});
