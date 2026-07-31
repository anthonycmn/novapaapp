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

export interface RubricCriterion {
  key: string;
  label: string;
  /** What the evaluator is actually looking for — shown on the form. */
  looksFor: string;
  /**
   * Objective descriptor for each score, 5 (highest) to 1. The evaluator
   * picks the sentence that matches what they saw; the number follows.
   * Subjectivity belongs in the notes, not the score.
   */
  levels: Record<5 | 4 | 3 | 2 | 1, string>;
}

/**
 * Rubric criteria per discipline. Written to be scoreable by observation:
 * two evaluators watching the same audition should land on the same number.
 */
export const RUBRIC_CRITERIA: Record<Discipline, RubricCriterion[]> = {
  acting: [
    {
      key: "diction_projection",
      label: "Diction & projection",
      looksFor:
        "Every word lands at the back of the house without shouting. Consonants are crisp, vowels open, volume controlled and sustained to the ends of lines.",
      levels: {
        5: "Every word clearly understood at distance for the entire piece; varies volume deliberately for effect.",
        4: "Nearly all words clear at distance; energy dips only at a line ending or two.",
        3: "Understandable most of the time, but drops words at line ends or rushes under pressure.",
        2: "Frequently hard to hear or understand; mumbles, trails off, or shouts without control.",
        1: "Largely inaudible or unintelligible from the table.",
      },
    },
    {
      key: "characterization",
      label: "Character choices & commitment",
      looksFor:
        "A specific, playable choice about who this person is — wants, status, attitude — sustained without breaking, even between lines. Bold beats safe.",
      levels: {
        5: "Makes a distinct, specific choice and commits to it every second, including in silence and reactions.",
        4: "Clear choice sustained through most of the piece; drops out briefly between beats.",
        3: "A recognizable choice appears in places but comes and goes; plays 'general' in between.",
        2: "Recites the text accurately but as themself; little evidence of a character choice.",
        1: "No discernible choice; disconnected from the material.",
      },
    },
    {
      key: "emotional_truth",
      label: "Emotional truth & range",
      looksFor:
        "Feelings that read as genuine rather than indicated, with at least one clear shift — a discovery, a turn — inside the piece. Watch the eyes, not the volume.",
      levels: {
        5: "Emotion reads as truthful and includes a clear, motivated shift; the turn is visible before the line.",
        4: "Truthful baseline emotion; the shift is present but arrives on the line rather than driving it.",
        3: "One consistent emotional note played sincerely; no real change across the piece.",
        2: "Emotion is indicated (face-acting, forced tears/laughs) rather than experienced.",
        1: "Flat throughout; no emotional engagement with the material.",
      },
    },
    {
      key: "physicality",
      label: "Physical life & stage presence",
      looksFor:
        "The body tells the same story as the voice: purposeful stance, gestures that come from impulse rather than habit, stillness when stillness is stronger. No drifting, swaying, or hand-wringing.",
      levels: {
        5: "Physicality is specific to the character and fully controlled; stillness and movement are both choices.",
        4: "Grounded and purposeful with occasional habitual movement (sway, shifting weight).",
        3: "Neutral body — neither distracting nor expressive; gestures are generic.",
        2: "Nervous habits distract (pacing, fidgeting, locked knees, hands in pockets).",
        1: "Physically checked out or so tense the piece can't land.",
      },
    },
    {
      key: "direction_taking",
      label: "Taking direction & adjustment",
      looksFor:
        "Give one concrete adjustment ('do it again, twice as angry', 'play it to your little brother') and watch what changes. We cast people we can direct, not finished performances.",
      levels: {
        5: "Transforms the piece on the adjustment — a genuinely different performance, not louder/faster.",
        4: "Makes a clear, correct change in the direction asked; keeps the rest intact.",
        3: "Attempts the change; partial or fades halfway through the redo.",
        2: "Repeats the original performance with cosmetic difference.",
        1: "Cannot repeat the piece or resists the adjustment.",
      },
    },
    {
      key: "focus_listening",
      label: "Focus & listening",
      looksFor:
        "Present from the moment they enter: focused eyes (not scanning the panel), listens to the reader/scene partner instead of waiting to talk, recovers from mistakes without breaking.",
      levels: {
        5: "Total presence; a stumble, noise, or dropped line is absorbed in character without a flicker.",
        4: "Focused throughout; a mistake causes a visible blink but recovery is fast and composed.",
        3: "Mostly focused; checks the panel for approval or briefly breaks after an error.",
        2: "Focus repeatedly leaves the piece — apologizing, restarting, watching the room.",
        1: "Unable to stay in the piece; stops or asks to start over more than once.",
      },
    },
  ],

  vocal: [
    {
      key: "pitch_intonation",
      label: "Pitch & intonation",
      looksFor:
        "Sings in tune — including entrances after rests, wide intervals, and the ends of phrases where support flags. Listen hardest at the passaggio and the final note.",
      levels: {
        5: "Secure intonation throughout, including leaps, entrances, and sustained final notes.",
        4: "In tune with isolated drift (an under-pitched leap or one flat sustained note), self-corrected.",
        3: "Generally centered but consistently under or over in one register, or drifts when unaccompanied.",
        2: "Frequent pitch errors; melody recognizable but unreliable.",
        1: "Largely off-pitch; melody not reliably reproduced.",
      },
    },
    {
      key: "breath_tone",
      label: "Breath support & tone",
      looksFor:
        "Phrases carried on supported breath, not chewed into two-word bites. Tone is free and unforced — no throat squeeze on top, no breathiness masking pitch, shoulders quiet on inhale.",
      levels: {
        5: "Full phrases on one breath with consistent, free tone across the range; breaths are planned and silent.",
        4: "Mostly supported; runs out of air on the longest phrase or thins slightly on top.",
        3: "Support comes and goes — pushed at climaxes or breathy in quiet passages; audible gasping breaths.",
        2: "Tone consistently forced or collapsed; breaths mid-word or every few notes.",
        1: "No functional breath management; sound cannot sustain a phrase.",
      },
    },
    {
      key: "rhythm_musicality",
      label: "Rhythm & musicality",
      looksFor:
        "Locks with the accompaniment: entrances on time, syncopation felt rather than approximated, dynamics and phrasing shaped instead of one flat volume start to finish.",
      levels: {
        5: "Rhythmically exact including syncopation and tempo changes; shapes dynamics and phrase endings deliberately.",
        4: "Solid time with musical shaping; one late entrance or squared-off syncopation.",
        3: "Keeps the basic pulse but rushes or drags under pressure; sings at one dynamic.",
        2: "Loses the accompaniment repeatedly; entrances need to be given.",
        1: "No stable relationship to the beat.",
      },
    },
    {
      key: "range_comfort",
      label: "Range & tessitura comfort",
      looksFor:
        "How the voice behaves where this show actually sits — comfortable top and bottom, register transitions managed without a clunk or a bail-out (dropping the octave, speaking the note).",
      levels: {
        5: "Entire song comfortably in voice, including the extremes; transitions between registers are smooth.",
        4: "Comfortable through nearly all of it; one strained top note or a carefully negotiated break.",
        3: "Mid-range secure but the top or bottom of the song is avoided, flipped, or strained.",
        2: "Significant portions of the song sit outside the usable range.",
        1: "The song's range is unavailable to the voice as sung today.",
      },
    },
    {
      key: "lyric_diction",
      label: "Lyric clarity",
      looksFor:
        "The words of the song survive being sung: final consonants present, vowels not swallowed on high notes, the story of the lyric intelligible without a lyric sheet.",
      levels: {
        5: "Every lyric intelligible at distance, even at the extremes of range and volume.",
        4: "Lyrics clear except on the highest or fastest passage.",
        3: "The gist comes through; consonants drop under load.",
        2: "Lyrics frequently lost; vowels only in much of the song.",
        1: "Words unintelligible throughout.",
      },
    },
    {
      key: "song_acting",
      label: "Acting the song",
      looksFor:
        "The song is a scene: they know who they're singing to and what they want, the face matches the lyric, and something changes between the first verse and the last.",
      levels: {
        5: "Complete dramatic arc — specific target, clear want, visible change; the song means something.",
        4: "Connected to the lyric with a real target; the arc flattens in the middle.",
        3: "Pleasant, present delivery but generalized — singing 'at the room' rather than to someone.",
        2: "Mechanical delivery; the face and the lyric tell different stories.",
        1: "No connection to the content of the song.",
      },
    },
  ],

  dance: [
    {
      key: "technique_alignment",
      label: "Technique & alignment",
      looksFor:
        "The fundamentals under the steps: posture and core engaged, turnout used honestly, feet pointed where they should be, knees tracking over toes on landings, spotting on turns.",
      levels: {
        5: "Clean, consistent technique across every step shown; lines finished through hands and feet.",
        4: "Solid technique with isolated lapses (a relaxed foot, one unspotted turn).",
        3: "Fundamentals present but inconsistent — alignment holds until the combination speeds up.",
        2: "Technique breaks down across most steps; safety concerns on landings.",
        1: "No functional technique base for this level.",
      },
    },
    {
      key: "musicality_timing",
      label: "Musicality & timing",
      looksFor:
        "Movement that lives inside the music: hitting accents, using counts without being enslaved to them, and finishing phrases with the music rather than after it.",
      levels: {
        5: "Precisely with the music throughout, including accents and holds; dances the dynamics, not just the counts.",
        4: "On time throughout; accents present, though attack is uniform.",
        3: "Keeps the count structure but slides ahead/behind within phrases.",
        2: "Frequently off the music; relies on watching others to stay in it.",
        1: "Movement has no consistent relationship to the music.",
      },
    },
    {
      key: "pickup_retention",
      label: "Pick-up & retention",
      looksFor:
        "Learns a taught combination in the time given, retains it without a front-row anchor, and — the real test — keeps or fixes it on the second run rather than degrading.",
      levels: {
        5: "Full combination retained and performed alone after the standard teach; second run is cleaner than the first.",
        4: "Nearly all retained; one blank moment self-corrected without stopping.",
        3: "Retains the shape with details missing; needs the group for the tricky section.",
        2: "Retains fragments; frequently a beat behind, copying neighbors.",
        1: "Cannot reproduce the combination after teaching.",
      },
    },
    {
      key: "spatial_awareness",
      label: "Spatial awareness & ensemble",
      looksFor:
        "Holds spacing and formations while dancing full-out: finds their window, travels the distance the choreography asks, doesn't crowd or clip neighbors, adjusts when the group shifts.",
      levels: {
        5: "Perfect spacing throughout — corrects the formation around them without being told.",
        4: "Holds spacing and lines; drifts once during travel and self-corrects.",
        3: "Roughly in place but compresses travel steps or loses the window during turns.",
        2: "Frequently out of formation; collides with or displaces neighbors.",
        1: "Unaware of others in space; unsafe in a group number.",
      },
    },
    {
      key: "performance_energy",
      label: "Performance quality",
      looksFor:
        "Face and energy while dancing: alive eyes, expression that matches the number, energy sustained through the last count — not just during the steps they like.",
      levels: {
        5: "Performs every count including transitions; the face sells the number even when the feet are working.",
        4: "Engaged and expressive; face goes neutral only during the hardest passage.",
        3: "Executes with 'concentration face' — clean but not yet performing.",
        2: "Energy visibly drops mid-combination; going through the motions.",
        1: "Disengaged; no performance layer at all.",
      },
    },
    {
      key: "control_strength",
      label: "Control, balance & strength",
      looksFor:
        "The engine underneath: balances held out of turns and on relevé, jumps landed with control (toe-ball-heel, plié), floor work entered and exited without collapsing, stamina to the end.",
      levels: {
        5: "Controlled landings, held balances, and full power on the final phrase — the last eight counts look like the first.",
        4: "Controlled through nearly all; one stumbled landing or wobbled balance, recovered cleanly.",
        3: "Control adequate at moderate tempo; landings get heavy and balances short as fatigue sets in.",
        2: "Landings consistently uncontrolled; balances not yet available.",
        1: "Insufficient strength/control for the choreography's demands, with safety risk.",
      },
    },
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
  /**
   * Optional "how to keep growing": concrete practice suggestions and
   * classes/lessons the evaluator recommends. Released to the family with
   * feedback — this is the constructive half.
   */
  growthNotes?: string;
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
  /**
   * Understudy phase — only opens after the main board is submitted.
   * Students are "duplicated": holding a role never blocks understudying a
   * LEAD (that's the point). One understudy per lead; a student may not
   * understudy the role they hold.
   */
  understudyEntries: CastingDraftEntry[];
  understudiesPublishedAt?: string;
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

/* ── script & curriculum: scenes/songs mapped to roles ──────────────────── */

/**
 * One unit of the show — a scene or musical number — with the roles called
 * for it. This is the "curriculum" an administrator uploads per production;
 * Frozen Jr. ships seeded from the MTI breakdown. Everything downstream
 * hangs off it: what parents see their child is in, and which rehearsals
 * appear on which child's calendar.
 */
export interface ShowScene {
  id: string;
  productionId: string;
  name: string;
  kind: "scene" | "song";
  /** ShowRole ids called for this scene/number. */
  roleIds: string[];
  sortOrder: number;
}

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
