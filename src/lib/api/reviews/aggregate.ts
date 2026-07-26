import {
  averageScore,
  type Review,
  type ReviewAggregate,
  type ReviewScores,
  type ReviewSubjectType,
  type TrendPoint,
} from "./types";

/**
 * Pure aggregation for review analytics (#15). No I/O, so the maths is
 * unit-testable and identical across data layers.
 */

const EMPTY: ReviewScores = {
  instructionQuality: 0,
  communication: 0,
  childGrowth: 0,
  organization: 0,
};

export function aggregate(
  reviews: Review[],
  subjectType: ReviewSubjectType,
  subjectId: string
): ReviewAggregate {
  if (reviews.length === 0) {
    return { subjectType, subjectId, count: 0, averages: { ...EMPTY }, overall: 0 };
  }

  const sum = reviews.reduce<ReviewScores>(
    (acc, review) => ({
      instructionQuality: acc.instructionQuality + review.scores.instructionQuality,
      communication: acc.communication + review.scores.communication,
      childGrowth: acc.childGrowth + review.scores.childGrowth,
      organization: acc.organization + review.scores.organization,
    }),
    { ...EMPTY }
  );

  const averages: ReviewScores = {
    instructionQuality: round(sum.instructionQuality / reviews.length),
    communication: round(sum.communication / reviews.length),
    childGrowth: round(sum.childGrowth / reviews.length),
    organization: round(sum.organization / reviews.length),
  };

  return {
    subjectType,
    subjectId,
    count: reviews.length,
    averages,
    overall: round(averageScore(averages)),
  };
}

/**
 * Monthly trend. Buckets by calendar month in UTC — close enough for a
 * season-long view, and avoids timezone drift in bucket boundaries.
 */
export function trend(reviews: Review[]): TrendPoint[] {
  const buckets = new Map<string, Review[]>();
  for (const review of reviews) {
    const period = review.createdAt.slice(0, 7);
    const list = buckets.get(period) ?? [];
    list.push(review);
    buckets.set(period, list);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, list]) => ({
      period,
      count: list.length,
      overall: round(
        list.reduce((sum, review) => sum + averageScore(review.scores), 0) / list.length
      ),
    }));
}

/**
 * Aggregate per staff member. A review counts toward every staff member
 * attached to its subject — for a co-taught class that's both teachers,
 * which is the honest reading of "how is this class going".
 */
export function aggregateByStaff(reviews: Review[]): Map<string, ReviewAggregate> {
  const byStaff = new Map<string, Review[]>();
  for (const review of reviews) {
    for (const staffId of review.staffIds) {
      const list = byStaff.get(staffId) ?? [];
      list.push(review);
      byStaff.set(staffId, list);
    }
  }

  const result = new Map<string, ReviewAggregate>();
  for (const [staffId, list] of byStaff) {
    result.set(staffId, aggregate(list, list[0].subjectType, staffId));
  }
  return result;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
