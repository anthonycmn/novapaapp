import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { livePaymentsBlockedBecause } from "@/lib/api/payments";

/**
 * The dangerous state is the one you pass THROUGH during setup: Stripe hands
 * you the webhook signing secret only after you create the endpoint, so for a
 * few minutes STRIPE_SECRET_KEY exists and STRIPE_WEBHOOK_SECRET does not.
 *
 * In that window checkout is live and the webhook answers 503, so a family is
 * charged and their order is never marked paid. This is the guard that stops
 * it, and it is worth a test because the window is invisible: everything looks
 * configured.
 */

const original = { ...process.env };

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterEach(() => {
  process.env = { ...original };
});

describe("when live payments may run", () => {
  it("allows the mock through — no key means no money", () => {
    expect(livePaymentsBlockedBecause()).toBeNull();
  });

  it("still allows the mock when only a webhook secret is set", () => {
    // Harmless: nothing charges without the secret key.
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    expect(livePaymentsBlockedBecause()).toBeNull();
  });

  it("allows a fully configured Stripe", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    expect(livePaymentsBlockedBecause()).toBeNull();
  });

  it("BLOCKS a key with no webhook secret — the money-losing state", () => {
    process.env.STRIPE_SECRET_KEY = "sk_live_something";
    const blocked = livePaymentsBlockedBecause();
    expect(blocked).toBeTruthy();
    // The sentence a parent reads has to answer the only question they have.
    expect(blocked).toContain("Nothing has been charged");
  });
});
