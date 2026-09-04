import { describe, expect, it } from "vitest";
import { profileSchema } from "@/lib/actions/audition-schema";
import { ROLE_TIERS } from "@/lib/api/auditions/types";

/**
 * The promise the audition form makes.
 *
 * CJ, 4 Sep 2026: "make sure they can submit the form if anything labeled
 * optional is not submitted."
 *
 * Four things on that page are labelled optional — the dance video, the resume,
 * previous roles and "anything else" — plus the headshot above it, which is a
 * separate section and cannot block a submission at all. A family that fills in
 * none of them must still be able to press the button, and that guarantee is
 * worth a test rather than a reading of the code, because it is one careless
 * `.min(1)` away from breaking silently for the people least likely to report
 * it.
 */

/** Everything a family MUST answer, and not one field more. */
const bareMinimum = {
  studentId: "student-1",
  productionId: "production-1",
  preferenceTier: "ensemble" as const,
  wantsSpeaking: false,
  wantsSinging: false,
  wantsDance: false,
  inPersonWithBackingTrack: false,
  acknowledged: true as const,
  // Everything below is labelled optional on the form, or has no field at all
  // any more. All of it arrives as "" when a family leaves it alone.
  previousRoles: "",
  hopes: "",
  songTitle: "",
  songUrl: "",
  auditionVideoUrl: "",
  danceVideoUrl: "",
  resumeUrl: "",
  notes: "",
};

describe("a family who fills in only what is required", () => {
  it("can submit", () => {
    const result = profileSchema.safeParse(bareMinimum);
    expect(
      result.success,
      result.success ? "" : JSON.stringify(result.error.issues, null, 2)
    ).toBe(true);
  });

  it("can submit whichever role size they pick", () => {
    for (const tier of ROLE_TIERS) {
      expect(
        profileSchema.safeParse({ ...bareMinimum, preferenceTier: tier.value }).success,
        `${tier.label} was refused`
      ).toBe(true);
    }
  });

  it("can submit having ticked none of the role kinds", () => {
    // The form says so out loud — "it is completely fine to tick none" — so the
    // schema had better agree with the sentence.
    expect(profileSchema.safeParse(bareMinimum).success).toBe(true);
  });
});

describe("each optional field, left empty on its own", () => {
  const optionalFields = [
    "danceVideoUrl",
    "resumeUrl",
    "previousRoles",
    "notes",
    "auditionVideoUrl",
  ] as const;

  for (const field of optionalFields) {
    it(`accepts an empty ${field}`, () => {
      expect(profileSchema.safeParse({ ...bareMinimum, [field]: "" }).success).toBe(true);
    });
  }
});

describe("the two things that are genuinely required", () => {
  it("still refuses without a role size", () => {
    const { preferenceTier: _omitted, ...withoutTier } = bareMinimum;
    expect(profileSchema.safeParse(withoutTier).success).toBe(false);
  });

  it("still refuses without the acknowledgement", () => {
    // Not ceremony: it is the family confirming that a preference does not
    // guarantee a part, and it is the sentence quoted back if anybody disputes.
    expect(profileSchema.safeParse({ ...bareMinimum, acknowledged: false }).success).toBe(false);
  });
});

describe("the karaoke checkbox", () => {
  it("submits either way", () => {
    for (const ticked of [true, false]) {
      expect(
        profileSchema.safeParse({ ...bareMinimum, inPersonWithBackingTrack: ticked }).success,
        `ticked=${ticked} was refused`
      ).toBe(true);
    }
  });

  it("can be ticked alongside a link, which is the whole point of it", () => {
    // A family auditioning in the room still sends a link — the backing track.
    // If this combination were refused the checkbox would be decorative.
    expect(
      profileSchema.safeParse({
        ...bareMinimum,
        inPersonWithBackingTrack: true,
        auditionVideoUrl: "https://example.com/karaoke-track",
      }).success
    ).toBe(true);
  });
});

describe("a link that is not a link", () => {
  it("is still refused, empty being the only exception", () => {
    expect(
      profileSchema.safeParse({ ...bareMinimum, danceVideoUrl: "javascript:alert(1)" }).success
    ).toBe(false);
  });
});
