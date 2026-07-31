/**
 * Auditions & casting.
 *
 * The flow, end to end:
 *   1. Family submits an audition profile: role-tier preference, previous
 *      roles, and hopes — with an explicit acknowledgment that a preference
 *      NEVER guarantees a part.
 *   2. During auditions, each discipline lead scores a rubric: the director
 *      scores acting, the vocal director scores singing, the choreographer
 *      scores dance. Each leaves callback notes.
 *   3. Staff drag registered students onto the show's roles. Named roles
 *      hold one student; ensemble groups hold many. Casting cannot be
 *      submitted until EVERY registered student has a role.
 *   4. On submit, each family is notified of THEIR child's role only —
 *      never a full cast list.
 *   5. The family confirms the playbill name (or corrects it), may request
 *      feedback (the rubrics + notes), and then sees class recommendations
 *      tied to their child's growth areas.
 */

/* ── role tiers, as defined by the org ──────────────────────────────────── */

export type RoleTier = "ensemble" | "featured" | "supporting" | "lead";

export const ROLE_TIERS: Array<{
  value: RoleTier;
  label: string;
  definition: string;
}> = [
  {
    value: "ensemble",
    label: "Ensemble",
    definition:
      "Part of the heart of the show — singing and dancing in the big numbers, playing townspeople, chorus, and group scenes. Every production depends on a strong ensemble.",
  },
  {
    value: "featured",
    label: "Featured role",
    definition:
      "An ensemble part with a featured moment of its own — a dance feature, a sung line, or a spoken line that belongs just to them.",
  },
  {
    value: "supporting",
    label: "Supporting role",
    definition:
      "A named character with some lines, and possibly a solo. On stage across multiple scenes, supporting the leads.",
  },
  {
    value: "lead",
    label: "Lead / tracked role",
    definition:
      "A principal character who carries scenes — a combination of significant lines, songs, and/or dance. The largest time commitment, including extra rehearsals.",
  },
];

/**
 * The sentence every audition form shows and every family must acknowledge.
 * Word it once, here, so the form and the confirmation record agree.
 */
export const NO_GUARANTEE_TEXT =
  "Sharing a preference helps our team understand your performer — but under no circumstances does it guarantee a specific part, or any particular size of role. Casting decisions balance the needs of the whole production, and every role matters.";

/* ── audition profile (family-submitted) ────────────────────────────────── */

export interface AuditionProfile {
  id: string;
  studentId: string;
  productionId: string;
  /** The tier the family/student is hoping for. */
  preferenceTier: RoleTier;
  /** Free-text previous roles (in addition to tracked show history). */
  previousRoles: string;
  /** What they hope to get out of the experience. */
  hopes: string;
  /** Timestamped acceptance of NO_GUARANTEE_TEXT. Required to submit. */
  acknowledgedNoGuaranteeAt: string;
  /** Who filled it in — the parent, or a 13+ student themselves. */
  submittedByUserId: string;
  submittedByRole: "parent" | "student";
  createdAt: string;
  updatedAt: string;
}

/* ── rubric ─────────────────────────────────────────────────────────────── */

export type Discipline = "acting" | "vocal" | "dance";

export const DISCIPLINES: Array<{
  value: Discipline;
  label: string;
  evaluatorTitle: string;
}> = [
  { value: "acting", label: "Acting", evaluatorTitle: "Director" },
  { value: "vocal", label: "Singing", evaluatorTitle: "Vocal / Music Director" },
  { value: "dance", label: "Dance", evaluatorTitle: "Choreographer" },
];

/** Rubric criteria per discipline, each scored 1–5. */
export const RUBRIC_CRITERIA: Record<
  Discipline,
  Array<{ key: string; label: string; hint: string }>
> = {
  acting: [
    { key: "characterization", label: "Characterization", hint: "Makes clear, committed choices" },
    { key: "projection", label: "Voice & diction", hint: "Can be heard and understood" },
    { key: "emotional_range", label: "Emotional range", hint: "Shows more than one color" },
    { key: "direction", label: "Takes direction", hint: "Adjusts when coached" },
  ],
  vocal: [
    { key: "pitch", label: "Pitch accuracy", hint: "Sings in tune" },
    { key: "tone", label: "Tone quality", hint: "Supported, pleasant sound" },
    { key: "range", label: "Range & flexibility", hint: "Comfortable across the song" },
    { key: "musicality", label: "Musicality", hint: "Rhythm, dynamics, phrasing" },
  ],
  dance: [
    { key: "technique", label: "Technique", hint: "Clean lines and control" },
    { key: "rhythm", label: "Rhythm & timing", hint: "Moves with the music" },
    { key: "pickup", label: "Picks up choreography", hint: "Learns combinations quickly" },
    { key: "performance", label: "Performance quality", hint: "Energy and face while dancing" },
  ],
};

export interface AuditionEvaluation {
  id: string;
  studentId: string;
  productionId: string;
  discipline: Discipline;
  evaluatorStaffId: string;
  evaluatorName: string;
  /** criterion key → 1–5. */
  scores: Record<string, number>;
  /** Private evaluator notes, released to the family only on request. */
  notes: string;
  /** Roles to consider at callbacks — staff-only, never released. */
  callbackNotes: string;
  createdAt: string;
  updatedAt: string;
}

/* ── show roles & the casting board ─────────────────────────────────────── */

export interface ShowRole {
  id: string;
  productionId: string;
  name: string;
  tier: RoleTier;
  description?: string;
  /**
   * How many students this role can hold. Named characters are 1; ensemble
   * groups are null (unlimited). This is the knob to turn if the org ever
   * wants strict one-student-per-role everywhere.
   */
  capacity: number | null;
  sortOrder: number;
}

/** Draft assignment on the casting board (before submit). */
export interface CastingDraftEntry {
  roleId: string;
  studentId: string;
}

export type CastingBoardStatus = "drafting" | "submitted";

export interface CastingBoard {
  productionId: string;
  status: CastingBoardStatus;
  entries: CastingDraftEntry[];
  submittedAt?: string;
  submittedByName?: string;
}

/* ── post-casting: family confirmation & feedback ───────────────────────── */

export interface CastingConfirmation {
  id: string;
  /** The published CastingAssignment this confirms. */
  assignmentId: string;
  studentId: string;
  familyId: string;
  /** null until the family responds. */
  nameCorrect?: boolean;
  /** Set when nameCorrect is false: exactly what the playbill should print. */
  playbillName?: string;
  respondedAt?: string;
  feedbackRequestedAt?: string;
  /**
   * Reminder bookkeeping: while unanswered, the family is re-notified every
   * 12 hours (org policy). Set to the submit time at creation.
   */
  lastRemindedAt?: string;
  reminderCount?: number;
}

/** How long an unanswered confirmation waits before the next reminder. */
export const CONFIRMATION_REMINDER_MS = 12 * 60 * 60 * 1000;

/* ── recommendations ────────────────────────────────────────────────────── */

export interface GrowthRecommendation {
  discipline: Discipline;
  /** Average rubric score that triggered this, for honest framing. */
  averageScore: number;
  /** Catalog products (lessons) that address it. */
  productIds: string[];
  /** Registration-system classes that address it (theoretical link for now). */
  classIds: string[];
  message: string;
}

/** Below this average, a discipline becomes a growth recommendation. */
export const RECOMMENDATION_THRESHOLD = 4;
