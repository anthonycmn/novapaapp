import { describe, expect, it } from "vitest";
import {
  isOrgAddress,
  SUBMISSION_RECIPIENTS,
} from "@/config/submission-recipients";
import { SPIRIT_BUTTON_PRICE_CENTS } from "@/lib/api/types";

describe("who keepsake submissions go to", () => {
  it("covers the five mailboxes Tony named", () => {
    expect(SUBMISSION_RECIPIENTS.map((r) => r.email).sort()).toEqual([
      "cj@novapa.org",
      "jen@novapa.org",
      "katie.h@novapa.org",
      "katie@novapa.org",
      "todd@novapa.org",
    ]);
  });

  it("sends a child's photo to org mailboxes only", () => {
    // The staff portal is an HR record and holds personal addresses — Katie
    // Hamburger's row is a gmail. A family's submission must never follow it
    // there, so every configured address has to be on the org domain.
    for (const recipient of SUBMISSION_RECIPIENTS) {
      expect(isOrgAddress(recipient.email), recipient.email).toBe(true);
    }
  });

  it("rejects personal domains outright", () => {
    expect(isOrgAddress("khchoreography@gmail.com")).toBe(false);
    expect(isOrgAddress("someone@novapa.org.evil.com")).toBe(false);
    expect(isOrgAddress("Someone@NOVAPA.ORG")).toBe(true);
  });

  it("names a staff-portal identity for every recipient", () => {
    // The bridge fills in names and titles by matching full_name; a blank one
    // silently degrades to the fallback label forever.
    for (const recipient of SUBMISSION_RECIPIENTS) {
      expect(recipient.portalName.trim().length, recipient.email).toBeGreaterThan(2);
    }
  });

  it("has no duplicate mailboxes", () => {
    const emails = SUBMISSION_RECIPIENTS.map((r) => r.email.toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
  });
});

describe("keepsake prices", () => {
  it("prices a spirit button at $12", () => {
    expect(SPIRIT_BUTTON_PRICE_CENTS).toBe(1200);
  });
});
