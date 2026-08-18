import { describe, expect, it } from "vitest";
import {
  ARRIVAL_RECIPIENTS,
  mergeRecipients,
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

describe("who hears an arrival", () => {
  it("is Katie Rivers and Katie Hamburger only", () => {
    // Tony, 17 Aug 2026: "a notification for the I'm here gets sent to Katie
    // Rivers and KDH." Two people who can walk to a door — an alert copied to
    // all five is an alert nobody owns.
    expect(ARRIVAL_RECIPIENTS.map((r) => r.email).sort()).toEqual([
      "katie.h@novapa.org",
      "katie@novapa.org",
    ]);
  });

  it("is a strict subset of the submission list", () => {
    // Derived from it rather than typed twice, so a corrected address cannot
    // apply to the paperwork and not to the kerb.
    const all = SUBMISSION_RECIPIENTS.map((r) => r.email);
    for (const recipient of ARRIVAL_RECIPIENTS) {
      expect(all).toContain(recipient.email);
    }
    expect(ARRIVAL_RECIPIENTS.length).toBeLessThan(SUBMISSION_RECIPIENTS.length);
  });

  it("still refuses a personal address", () => {
    for (const recipient of ARRIVAL_RECIPIENTS) {
      expect(isOrgAddress(recipient.email), recipient.email).toBe(true);
    }
  });
});

describe("who hears a pickup or a drop-off", () => {
  it("adds the admins to the named list without mailing anyone twice", () => {
    // Tony, 18 Aug 2026: "Make sure that pickup and drop off notifications go
    // to admin and super admin." Katie Rivers is on both lists — one address,
    // one email.
    const admins = [
      { email: "katie@novapa.org", name: "Katie Rivers" },
      { email: "zoe@novapa.org", name: "Zoe Schauder" },
    ];
    const merged = mergeRecipients(ARRIVAL_RECIPIENTS, admins);
    expect(merged.map((r) => r.email).sort()).toEqual([
      "katie.h@novapa.org",
      "katie@novapa.org",
      "zoe@novapa.org",
    ]);
  });

  it("treats a mailbox typed two ways as one person", () => {
    const merged = mergeRecipients(
      [{ email: "CJ@Novapa.org" }],
      [{ email: "cj@novapa.org" }]
    );
    expect(merged).toHaveLength(1);
  });

  it("keeps the first mention, so the named list keeps its title", () => {
    const merged = mergeRecipients(
      [{ email: "katie@novapa.org", name: "Katie Rivers" }],
      [{ email: "katie@novapa.org", name: "katie" }]
    );
    expect(merged[0].name).toBe("Katie Rivers");
  });
});
