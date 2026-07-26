/**
 * Private class & production reviews (#15).
 *
 * The privacy model is the whole point of this feature, so state it plainly:
 *
 *   • A review is NEVER visible to other families and NEVER public.
 *   • Admins see everything, including who wrote an anonymous review.
 *   • Staff see aggregate scores and the written text of reviews about
 *     their own work — but when a review is anonymous, staff must not be
 *     able to tell who wrote it.
 *
 * That last rule is why `reviewerUserId` is always stored (admins need it
 * for follow-up) and why every staff-facing read path goes through
 * `toStaffView()`, which strips identity.
 */

export type ReviewSubjectType = "class" | "production";

/** When a review window opens. */
export type ReviewWindowKind = "mid_session" | "end_of_session" | "post_show";

export interface ReviewWindow {
  id: string;
  kind: ReviewWindowKind;
  subjectType: ReviewSubjectType;
  subjectId: string;
  /** ISO timestamps; a review can only be submitted inside this range. */
  opensAt: string;
  closesAt: string;
}

/** The structured prompts every review answers, 1–5 each. */
export interface ReviewScores {
  instructionQuality: number;
  communication: number;
  childGrowth: number;
  organization: number;
}

export const SCORE_PROMPTS: Array<{ key: keyof ReviewScores; label: string; hint: string }> = [
  {
    key: "instructionQuality",
    label: "Quality of instruction",
    hint: "Was the teaching clear, skilled, and age-appropriate?",
  },
  {
    key: "communication",
    label: "Communication",
    hint: "Did you get the information you needed, in good time?",
  },
  {
    key: "childGrowth",
    label: "My child's growth",
    hint: "Did your child develop skills or confidence?",
  },
  {
    key: "organization",
    label: "Organization",
    hint: "Were schedules, rehearsals, and logistics well run?",
  },
];

export interface Review {
  id: string;
  windowId: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  /** Always stored. Admins can see it; staff views must strip it. */
  reviewerUserId: string;
  reviewerName: string;
  familyId: string;
  /** Which staff this review is *about*, when the subject has assigned staff. */
  staffIds: string[];
  scores: ReviewScores;
  comment: string;
  /** Hides identity from staff — never from admins. */
  isAnonymous: boolean;
  createdAt: string;
  /** Admin follow-up. */
  flaggedAt?: string;
  flagReason?: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

/**
 * A review as a staff member is allowed to see it. Note there is no
 * reviewerUserId field at all — not "null when anonymous" but absent from
 * the type, so a staff-facing template cannot accidentally render it.
 */
export interface StaffReviewView {
  id: string;
  subjectType: ReviewSubjectType;
  subjectId: string;
  /** "A family" when anonymous, otherwise the reviewer's name. */
  attribution: string;
  scores: ReviewScores;
  comment: string;
  createdAt: string;
}

export interface ReviewAggregate {
  subjectType: ReviewSubjectType;
  subjectId: string;
  count: number;
  averages: ReviewScores;
  /** Mean of the four averages, for a single headline number. */
  overall: number;
}

/** One point on a trend chart. */
export interface TrendPoint {
  /** Bucket label, e.g. "2026-07". */
  period: string;
  count: number;
  overall: number;
}

export function averageScore(scores: ReviewScores): number {
  return (
    (scores.instructionQuality +
      scores.communication +
      scores.childGrowth +
      scores.organization) /
    4
  );
}

/** Strips reviewer identity for staff consumption. */
export function toStaffView(review: Review): StaffReviewView {
  return {
    id: review.id,
    subjectType: review.subjectType,
    subjectId: review.subjectId,
    attribution: review.isAnonymous ? "A family" : review.reviewerName,
    scores: review.scores,
    comment: review.comment,
    createdAt: review.createdAt,
  };
}
