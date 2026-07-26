import { beforeEach, describe, expect, it } from "vitest";
import { AccessDeniedError } from "@/lib/api/provider";
import { MockDataProvider, resetMockStore } from "@/lib/api/mock/provider";
import { aggregate, aggregateByStaff, trend } from "@/lib/api/reviews/aggregate";
import { averageScore, toStaffView, type Review } from "@/lib/api/reviews/types";

/**
 * Phase 7 verification: "a review is provably invisible to non-authorized
 * roles". The sharp edge here is anonymity — an anonymous review must be
 * unattributable by the staff member it's about, while remaining
 * attributable to an admin.
 */

const provider = new MockDataProvider();

const goodScores = {
  instructionQuality: 5,
  communication: 4,
  childGrowth: 5,
  organization: 4,
};

beforeEach(() => {
  resetMockStore();
});

describe("aggregation (pure)", () => {
  const review = (overrides: Partial<Review> = {}): Review => ({
    id: "r",
    windowId: "w",
    subjectType: "class",
    subjectId: "class-mtd2",
    reviewerUserId: "u",
    reviewerName: "N",
    familyId: "f",
    staffIds: ["staff-priya"],
    scores: goodScores,
    comment: "",
    isAnonymous: false,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  });

  it("returns zeros for an empty set rather than NaN", () => {
    const result = aggregate([], "class", "class-mtd2");
    expect(result.count).toBe(0);
    expect(result.overall).toBe(0);
    expect(Number.isNaN(result.averages.communication)).toBe(false);
  });

  it("averages each prompt independently", () => {
    const result = aggregate(
      [
        review({ scores: { instructionQuality: 5, communication: 1, childGrowth: 5, organization: 1 } }),
        review({ scores: { instructionQuality: 3, communication: 3, childGrowth: 3, organization: 3 } }),
      ],
      "class",
      "class-mtd2"
    );
    expect(result.averages.instructionQuality).toBe(4);
    expect(result.averages.communication).toBe(2);
    expect(result.overall).toBe(3);
  });

  it("buckets trends by month in order", () => {
    const points = trend([
      review({ createdAt: "2026-07-05T00:00:00.000Z" }),
      review({ createdAt: "2026-05-02T00:00:00.000Z" }),
      review({ createdAt: "2026-07-20T00:00:00.000Z" }),
    ]);
    expect(points.map((p) => p.period)).toEqual(["2026-05", "2026-07"]);
    expect(points[1].count).toBe(2);
  });

  it("counts a co-taught class toward every attached staff member", () => {
    const byStaff = aggregateByStaff([
      review({ staffIds: ["staff-priya", "staff-marcus"] }),
    ]);
    expect(byStaff.get("staff-priya")?.count).toBe(1);
    expect(byStaff.get("staff-marcus")?.count).toBe(1);
  });

  it("averageScore matches the four prompts", () => {
    expect(averageScore(goodScores)).toBe(4.5);
  });
});

describe("anonymity boundary (#15)", () => {
  it("toStaffView has no reviewer id field at all", () => {
    const view = toStaffView({
      id: "r1",
      windowId: "w",
      subjectType: "class",
      subjectId: "class-mtd2",
      reviewerUserId: "user-minh",
      reviewerName: "Minh Nguyen",
      familyId: "fam-nguyen",
      staffIds: [],
      scores: goodScores,
      comment: "hi",
      isAnonymous: true,
      createdAt: "2026-07-01T00:00:00.000Z",
    });
    expect(view.attribution).toBe("A family");
    expect(JSON.stringify(view)).not.toContain("user-minh");
    expect(JSON.stringify(view)).not.toContain("Minh");
    expect(JSON.stringify(view)).not.toContain("fam-nguyen");
  });

  it("staff cannot identify an anonymous reviewer, but see the content", async () => {
    // Seed rev-2 is Minh Nguyen's anonymous review of Priya's class.
    const { reviews } = await provider.getReviewsForStaff("user-priya", "staff-priya");
    const anonymous = reviews.find((review) => review.comment.includes("schedule changes"))!;

    expect(anonymous.attribution).toBe("A family");
    expect(JSON.stringify(reviews)).not.toContain("Minh");
    // The substance still reaches the staff member — that's the point.
    expect(anonymous.comment).toContain("schedule changes");
  });

  it("a named review is attributed to its author for staff", async () => {
    const { reviews } = await provider.getReviewsForStaff("user-priya", "staff-priya");
    const named = reviews.find((review) => review.comment.includes("shell"))!;
    expect(named.attribution).toBe("Ngozi Okafor");
  });

  it("admins CAN see who wrote an anonymous review", async () => {
    const all = await provider.getAllReviews("user-dana");
    const anonymous = all.find((review) => review.isAnonymous)!;
    expect(anonymous.reviewerName).toBe("Minh Nguyen");
    expect(anonymous.reviewerUserId).toBe("user-minh");
  });
});

describe("who can read what (#15)", () => {
  it("families can never read the full review list", async () => {
    await expect(provider.getAllReviews("user-sofia")).rejects.toThrow(AccessDeniedError);
  });

  it("a non-admin staff member cannot read the full review list", async () => {
    await expect(provider.getAllReviews("user-marcus")).rejects.toThrow(AccessDeniedError);
  });

  it("a staff member cannot read another staff member's feedback", async () => {
    await expect(
      provider.getReviewsForStaff("user-marcus", "staff-priya")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("an admin can read any staff member's feedback", async () => {
    const { aggregate: summary } = await provider.getReviewsForStaff("user-dana", "staff-priya");
    expect(summary.count).toBe(2);
  });

  it("families cannot read aggregates", async () => {
    await expect(
      provider.getReviewAggregate("user-sofia", "class", "class-mtd2")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("a family sees only its own submissions", async () => {
    const okafor = await provider.getMyReviews("user-ngozi");
    const nguyen = await provider.getMyReviews("user-minh");
    expect(okafor).toHaveLength(1);
    expect(okafor[0].familyId).toBe("fam-okafor");
    expect(nguyen[0].familyId).toBe("fam-nguyen");
    // The Martinez family wrote none.
    expect(await provider.getMyReviews("user-sofia")).toHaveLength(0);
  });
});

describe("submission rules (#15)", () => {
  it("only opens a window to families enrolled in that subject", async () => {
    // Ava (Martinez) IS in class-mtd2; the Martinez family should see it.
    const martinez = await provider.getOpenReviewWindows("user-sofia");
    expect(martinez.some((entry) => entry.window.id === "rw-mtd2-mid")).toBe(true);
  });

  it("does not offer a window that hasn't opened yet", async () => {
    const windows = await provider.getOpenReviewWindows("user-sofia");
    // The post-show window for Frozen opens in November.
    expect(windows.some((entry) => entry.window.id === "rw-frozen-post")).toBe(false);
  });

  it("accepts a valid submission and marks the window answered", async () => {
    const review = await provider.submitReview("user-sofia", {
      windowId: "rw-mtd2-mid",
      scores: goodScores,
      comment: "Ava loves it.",
      isAnonymous: false,
    });
    expect(review.familyId).toBe("fam-martinez");
    expect(review.staffIds).toEqual(["staff-priya"]);

    const windows = await provider.getOpenReviewWindows("user-sofia");
    expect(windows.find((entry) => entry.window.id === "rw-mtd2-mid")?.alreadySubmitted).toBe(
      true
    );
  });

  it("refuses a second review of the same window from one family", async () => {
    await provider.submitReview("user-sofia", {
      windowId: "rw-mtd2-mid",
      scores: goodScores,
      comment: "",
      isAnonymous: false,
    });
    await expect(
      provider.submitReview("user-sofia", {
        windowId: "rw-mtd2-mid",
        scores: goodScores,
        comment: "again",
        isAnonymous: false,
      })
    ).rejects.toThrow(/already submitted/);
  });

  it("refuses a review for something the family isn't enrolled in", async () => {
    // The Nguyen family has no student in class-mtd2 — only in Frozen.
    await expect(
      provider.submitReview("user-minh", {
        windowId: "rw-mtd2-mid",
        scores: goodScores,
        comment: "",
        isAnonymous: false,
      })
    ).rejects.toThrow(AccessDeniedError);
  });

  it("refuses a review outside the window", async () => {
    await expect(
      provider.submitReview("user-sofia", {
        windowId: "rw-frozen-post",
        scores: goodScores,
        comment: "",
        isAnonymous: false,
      })
    ).rejects.toThrow(/isn't open/);
  });

  it("rejects out-of-range ratings", async () => {
    await expect(
      provider.submitReview("user-sofia", {
        windowId: "rw-mtd2-mid",
        scores: { ...goodScores, communication: 9 },
        comment: "",
        isAnonymous: false,
      })
    ).rejects.toThrow(/between 1 and 5/);
  });

  it("staff cannot submit reviews", async () => {
    await expect(
      provider.submitReview("user-marcus", {
        windowId: "rw-mtd2-mid",
        scores: goodScores,
        comment: "",
        isAnonymous: false,
      })
    ).rejects.toThrow(AccessDeniedError);
  });
});

describe("admin follow-up (#15)", () => {
  it("flags and resolves a review", async () => {
    const flagged = await provider.flagReview("user-dana", "rev-2", "Communication concern");
    expect(flagged.flaggedAt).toBeTruthy();
    expect(flagged.resolvedAt).toBeUndefined();

    const resolved = await provider.resolveReview("user-dana", "rev-2", "Spoke with Priya");
    expect(resolved.resolvedAt).toBeTruthy();
    expect(resolved.resolutionNote).toBe("Spoke with Priya");
  });

  it("non-admins cannot flag or resolve", async () => {
    await expect(
      provider.flagReview("user-marcus", "rev-1", "nope")
    ).rejects.toThrow(AccessDeniedError);
    await expect(
      provider.resolveReview("user-sofia", "rev-1", "nope")
    ).rejects.toThrow(AccessDeniedError);
  });

  it("only admins can open a review window", async () => {
    await expect(
      provider.createReviewWindow("user-marcus", {
        kind: "post_show",
        subjectType: "production",
        subjectId: "prod-frozen",
        opensAt: "2026-08-01T00:00:00.000Z",
        closesAt: "2026-08-31T00:00:00.000Z",
      })
    ).rejects.toThrow(AccessDeniedError);

    const window = await provider.createReviewWindow("user-dana", {
      kind: "post_show",
      subjectType: "production",
      subjectId: "prod-frozen",
      opensAt: "2026-01-01T00:00:00.000Z",
      closesAt: "2027-01-01T00:00:00.000Z",
    });
    expect(window.id).toBeTruthy();
  });
});
