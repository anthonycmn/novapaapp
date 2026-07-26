import type {
  CastingAssignment,
  CalendarEvent,
  ClassOffering,
  EmailTemplate,
  Enrollment,
  ButtonTemplate,
  Family,
  FeedPost,
  Guardian,
  HealthForm,
  HopesEntry,
  PostQuestion,
  Production,
  Program,
  Season,
  ShowHistoryEntry,
  StaffProfile,
  Student,
  User,
} from "../types";
import type { Review, ReviewWindow } from "../reviews/types";

/**
 * Realistic demo data: three families, five students, four staff,
 * the current season's programs and productions. Mirrors what
 * scripts/seed.ts inserts into Supabase.
 */

const T0 = "2026-06-01T12:00:00.000Z";

export const seasons: Season[] = [
  { id: "season-2526", name: "2025–2026", startsOn: "2025-08-15", endsOn: "2026-06-15", isCurrent: false },
  { id: "season-2627", name: "2026–2027", startsOn: "2026-08-15", endsOn: "2027-06-15", isCurrent: true },
];

export const programs: Program[] = [
  { id: "prog-bb-fall", name: "Broadway Bound Fall", seasonId: "season-2627", description: "Fully produced fall musical, ages 5–17." },
  { id: "prog-bb-spring", name: "Broadway Bound Spring", seasonId: "season-2627", description: "Fully produced spring musical, ages 5–17." },
  { id: "prog-classes", name: "Fall Classes", seasonId: "season-2627", description: "Weekly technique classes." },
];

export const productions: Production[] = [
  {
    id: "prod-frozen",
    programId: "prog-bb-fall",
    title: "Frozen Jr.",
    seasonId: "season-2627",
    venue: "Ernst Community Theater",
    directorStaffId: "staff-dana",
    opensOn: "2026-11-13",
    closesOn: "2026-11-22",
    ticketsUrl: "https://novapa.booktix.com",
  },
  {
    id: "prod-mermaid",
    programId: "prog-bb-spring",
    title: "The Little Mermaid Jr.",
    seasonId: "season-2627",
    venue: "Ernst Community Theater",
    directorStaffId: "staff-marcus",
    opensOn: "2027-04-23",
    closesOn: "2027-05-02",
    ticketsUrl: "https://novapa.booktix.com",
  },
];

export const classes: ClassOffering[] = [
  {
    id: "class-mtd2",
    programId: "prog-classes",
    name: "Musical Theater Dance — Level 2",
    dayOfWeek: 2,
    startTime: "17:00",
    endTime: "18:00",
    location: "Studio A, Chantilly",
    staffIds: ["staff-priya"],
  },
  {
    id: "class-voice1",
    programId: "prog-classes",
    name: "Vocal Technique — Beginners",
    dayOfWeek: 4,
    startTime: "16:30",
    endTime: "17:30",
    location: "Studio B, Chantilly",
    staffIds: ["staff-marcus"],
  },
];

export const staffProfiles: StaffProfile[] = [
  {
    id: "staff-dana",
    userId: "user-dana",
    fullName: "Dana Whitfield",
    title: "Artistic Director",
    bio: "Dana has directed youth theater in Northern Virginia for 15 years and believes every kid deserves a bow.",
    specialties: ["Directing", "Musical Staging"],
    credits: "Directed 40+ youth productions including Annie Jr., Matilda Jr., and Into the Woods Jr.",
    isPublished: true,
  },
  {
    id: "staff-marcus",
    userId: "user-marcus",
    fullName: "Marcus Lee",
    title: "Music Director",
    bio: "Vocal coach and pianist. Alumni have gone on to all-state choir and collegiate MT programs.",
    specialties: ["Vocal Coaching", "Music Direction"],
    isPublished: true,
  },
  {
    id: "staff-priya",
    userId: "user-priya",
    fullName: "Priya Raman",
    title: "Choreographer & Teaching Artist",
    bio: "Trained in ballet, jazz, and tap; teaches dancers of every level with patience and glitter.",
    specialties: ["Choreography", "Tap", "Jazz"],
    isPublished: true,
  },
  {
    id: "staff-jo",
    userId: "user-jo",
    fullName: "Jo Castillo",
    title: "Stage Manager & Operations",
    bio: "Keeps the trains (and tech weeks) running on time.",
    specialties: ["Stage Management", "Production Ops"],
    isPublished: true,
  },
];

export const families: Family[] = [
  {
    id: "fam-martinez",
    name: "The Martinez Family",
    addressLine1: "4312 Maple Grove Ct",
    city: "Fairfax",
    state: "VA",
    zip: "22030",
    preferredContactMethod: "email",
    communicationLanguage: "en",
    staffNotes: "Prefers pickup at side entrance; younger sibling often along.",
    emergencyContacts: [
      { id: "ec-1", fullName: "Rosa Delgado", phone: "703-555-0182", relationship: "Grandmother" },
    ],
    authorizedPickups: [
      { id: "ap-1", fullName: "Rosa Delgado", relationship: "Grandmother" },
      { id: "ap-2", fullName: "Kevin Martinez", relationship: "Uncle" },
    ],
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "fam-okafor",
    name: "The Okafor Family",
    addressLine1: "9051 Birch Hollow Dr",
    city: "Centreville",
    state: "VA",
    zip: "20121",
    preferredContactMethod: "sms",
    communicationLanguage: "en",
    emergencyContacts: [
      { id: "ec-2", fullName: "Chidi Okafor Sr.", phone: "571-555-0114", relationship: "Grandfather" },
    ],
    authorizedPickups: [{ id: "ap-3", fullName: "Amara Eze", relationship: "Family friend" }],
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "fam-nguyen",
    name: "The Nguyen Family",
    addressLine1: "1420 Sully Station Pl",
    city: "Chantilly",
    state: "VA",
    zip: "20151",
    preferredContactMethod: "email",
    communicationLanguage: "vi",
    emergencyContacts: [
      { id: "ec-3", fullName: "Lan Pham", phone: "703-555-0167", relationship: "Aunt" },
    ],
    authorizedPickups: [{ id: "ap-4", fullName: "Lan Pham", relationship: "Aunt" }],
    createdAt: T0,
    updatedAt: T0,
  },
];

export const guardians: Guardian[] = [
  { id: "g-1", familyId: "fam-martinez", userId: "user-sofia", fullName: "Sofia Martinez", email: "sofia@example.com", phone: "703-555-0101", relationship: "Mother", isPrimary: true },
  { id: "g-2", familyId: "fam-martinez", fullName: "Diego Martinez", email: "diego@example.com", phone: "703-555-0102", relationship: "Father", isPrimary: false },
  { id: "g-3", familyId: "fam-okafor", userId: "user-ngozi", fullName: "Ngozi Okafor", email: "ngozi@example.com", phone: "571-555-0110", relationship: "Mother", isPrimary: true },
  { id: "g-4", familyId: "fam-nguyen", userId: "user-minh", fullName: "Minh Nguyen", email: "minh@example.com", phone: "703-555-0160", relationship: "Father", isPrimary: true },
];

export const students: Student[] = [
  {
    id: "stu-ava",
    familyId: "fam-martinez",
    firstName: "Ava",
    lastName: "Martinez",
    preferredName: "Ava",
    dateOfBirth: "2015-03-12",
    grade: "5",
    school: "Willow Springs ES",
    tshirtSize: "YL",
    allergies: "Peanuts (EpiPen in bag)",
    // Face matching defaults OFF for every student (PRIVACY.md): consent is
    // granted through the explanation + reference-photo flow, never seeded on.
    consents: { photoUse: true, faceMatching: false, directoryVisible: true },
    resumeCredits: [
      { id: "rc-1", category: "role", title: "Young Anna — Frozen Jr. (2025)", organization: "NOVA PA", year: "2025" },
      { id: "rc-2", category: "training", title: "Ballet — 3 years", organization: "Fairfax Dance Academy" },
    ],
    vocalRange: "A3–D5",
    auditionSongUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    hasLogin: false,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "stu-leo",
    familyId: "fam-martinez",
    firstName: "Leo",
    lastName: "Martinez",
    dateOfBirth: "2018-09-02",
    grade: "2",
    school: "Willow Springs ES",
    tshirtSize: "YS",
    consents: { photoUse: true, faceMatching: false, directoryVisible: false },
    resumeCredits: [],
    hasLogin: false,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "stu-chidi",
    familyId: "fam-okafor",
    firstName: "Chidi",
    lastName: "Okafor",
    pronouns: "he/him",
    dateOfBirth: "2012-01-25",
    grade: "8",
    school: "Liberty MS",
    tshirtSize: "AM",
    medicalFlags: "Asthma — inhaler in backpack",
    consents: { photoUse: true, faceMatching: false, directoryVisible: true },
    resumeCredits: [
      { id: "rc-3", category: "role", title: "Sebastian — The Little Mermaid Jr. (2024)", organization: "NOVA PA", year: "2024" },
      { id: "rc-4", category: "special_skill", title: "Beatboxing" },
    ],
    vocalRange: "G2–E4",
    hasLogin: true,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "stu-amara",
    familyId: "fam-okafor",
    firstName: "Amara",
    lastName: "Okafor",
    dateOfBirth: "2016-07-19",
    grade: "4",
    school: "Bull Run ES",
    tshirtSize: "YM",
    consents: { photoUse: false, faceMatching: false, directoryVisible: false },
    resumeCredits: [],
    hasLogin: false,
    createdAt: T0,
    updatedAt: T0,
  },
  {
    id: "stu-lien",
    familyId: "fam-nguyen",
    firstName: "Liên",
    lastName: "Nguyen",
    preferredName: "Lily",
    pronouns: "she/her",
    dateOfBirth: "2013-11-08",
    grade: "7",
    school: "Rocky Run MS",
    tshirtSize: "AS",
    allergies: "Tree nuts",
    consents: { photoUse: true, faceMatching: false, directoryVisible: true },
    resumeCredits: [
      { id: "rc-5", category: "training", title: "Piano — 5 years" },
    ],
    vocalRange: "C4–G5",
    hasLogin: false,
    createdAt: T0,
    updatedAt: T0,
  },
];

export const users: User[] = [
  { id: "user-sofia", email: "sofia@example.com", displayName: "Sofia Martinez", role: "parent", familyId: "fam-martinez", createdAt: T0 },
  { id: "user-ngozi", email: "ngozi@example.com", displayName: "Ngozi Okafor", role: "parent", familyId: "fam-okafor", createdAt: T0 },
  { id: "user-minh", email: "minh@example.com", displayName: "Minh Nguyen", role: "parent", familyId: "fam-nguyen", createdAt: T0 },
  { id: "user-chidi", email: "chidi@example.com", displayName: "Chidi Okafor", role: "student", familyId: "fam-okafor", createdAt: T0 },
  { id: "user-dana", email: "dana@example.com", displayName: "Dana Whitfield", role: "admin", staffId: "staff-dana", createdAt: T0 },
  { id: "user-marcus", email: "marcus@example.com", displayName: "Marcus Lee", role: "staff", staffId: "staff-marcus", createdAt: T0 },
  { id: "user-priya", email: "priya@example.com", displayName: "Priya Raman", role: "staff", staffId: "staff-priya", createdAt: T0 },
  { id: "user-jo", email: "jo@example.com", displayName: "Jo Castillo", role: "staff", staffId: "staff-jo", createdAt: T0 },
  { id: "user-tony", email: "anthonycmn@gmail.com", displayName: "Tony", role: "super_admin", createdAt: T0 },
];

export const enrollments: Enrollment[] = [
  { id: "enr-1", studentId: "stu-ava", productionId: "prod-frozen", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: T0 },
  { id: "enr-2", studentId: "stu-ava", classId: "class-mtd2", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: T0 },
  { id: "enr-3", studentId: "stu-leo", productionId: "prod-frozen", status: "enrolled", balanceCents: 7500, source: "registration_portal", createdAt: T0 },
  { id: "enr-4", studentId: "stu-chidi", productionId: "prod-frozen", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: T0 },
  { id: "enr-5", studentId: "stu-chidi", classId: "class-voice1", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: T0 },
  { id: "enr-6", studentId: "stu-amara", classId: "class-mtd2", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: T0 },
  { id: "enr-7", studentId: "stu-lien", productionId: "prod-frozen", status: "enrolled", balanceCents: 0, source: "registration_portal", createdAt: T0 },
];

export const casting: CastingAssignment[] = [
  { id: "cast-1", productionId: "prod-frozen", studentId: "stu-ava", characterName: "Young Elsa", isUnderstudy: false, rehearsalTrack: "Track A", publishedAt: "2026-09-10T22:00:00.000Z" },
  { id: "cast-2", productionId: "prod-frozen", studentId: "stu-leo", characterName: "Ensemble — Snow Chorus", castGroup: "Ensemble", isUnderstudy: false, rehearsalTrack: "Track C", publishedAt: "2026-09-10T22:00:00.000Z" },
  { id: "cast-3", productionId: "prod-frozen", studentId: "stu-chidi", characterName: "Kristoff", isUnderstudy: false, rehearsalTrack: "Track A", publishedAt: "2026-09-10T22:00:00.000Z" },
  { id: "cast-4", productionId: "prod-frozen", studentId: "stu-lien", characterName: "Anna", isUnderstudy: false, rehearsalTrack: "Track A", publishedAt: "2026-09-10T22:00:00.000Z" },
];

export const showHistory: ShowHistoryEntry[] = [
  { id: "sh-1", studentId: "stu-ava", productionTitle: "Frozen Jr.", role: "Young Anna", seasonName: "2024–2025", director: "Dana Whitfield", venue: "Ernst Community Theater", fromCasting: true, year: "2025" },
  { id: "sh-2", studentId: "stu-chidi", productionTitle: "The Little Mermaid Jr.", role: "Sebastian", seasonName: "2023–2024", director: "Dana Whitfield", venue: "Ernst Community Theater", fromCasting: true, year: "2024" },
  { id: "sh-3", studentId: "stu-chidi", productionTitle: "A Christmas Carol", role: "Tiny Tim", seasonName: "2022", organization: "Centreville Community Players", fromCasting: false, year: "2022" },
];

export const hopes: HopesEntry[] = [
  {
    id: "hope-1",
    seasonId: "season-2627",
    author: "parent",
    text: "We hope Ava gets a chance at a named role this year — she has been practicing every night. More than anything we want her confidence to keep growing.",
    visibleToStudent: false,
    createdAt: "2026-08-20T14:00:00.000Z",
    updatedAt: "2026-08-20T14:00:00.000Z",
  },
  {
    id: "hope-2",
    seasonId: "season-2627",
    author: "student",
    text: "I want to be Elsa or at least a part with a solo!! And to get better at harmonies.",
    visibleToStudent: true,
    createdAt: "2026-08-21T19:30:00.000Z",
    updatedAt: "2026-08-21T19:30:00.000Z",
  },
];

/** hopes are keyed to students in the store; hope-1/2 belong to stu-ava */
export const hopesByStudent: Record<string, string[]> = {
  "stu-ava": ["hope-1", "hope-2"],
};

export const reviewWindows: ReviewWindow[] = [
  {
    id: "rw-mtd2-mid",
    kind: "mid_session",
    subjectType: "class",
    subjectId: "class-mtd2",
    // Open now, so the demo can submit one.
    opensAt: "2026-07-20T00:00:00.000Z",
    closesAt: "2026-12-31T23:59:59.000Z",
  },
  {
    id: "rw-frozen-post",
    kind: "post_show",
    subjectType: "production",
    subjectId: "prod-frozen",
    // Not open yet — the show hasn't happened.
    opensAt: "2026-11-23T00:00:00.000Z",
    closesAt: "2026-12-15T23:59:59.000Z",
  },
];

export const reviews: Review[] = [
  {
    id: "rev-1",
    windowId: "rw-mtd2-mid",
    subjectType: "class",
    subjectId: "class-mtd2",
    reviewerUserId: "user-ngozi",
    reviewerName: "Ngozi Okafor",
    familyId: "fam-okafor",
    staffIds: ["staff-priya"],
    scores: {
      instructionQuality: 5,
      communication: 4,
      childGrowth: 5,
      organization: 4,
    },
    comment:
      "Amara has come out of her shell completely this session. Priya is wonderful with the shyer kids.",
    isAnonymous: false,
    createdAt: "2026-06-15T18:00:00.000Z",
  },
  {
    id: "rev-2",
    windowId: "rw-mtd2-mid",
    subjectType: "class",
    subjectId: "class-mtd2",
    reviewerUserId: "user-minh",
    reviewerName: "Minh Nguyen",
    familyId: "fam-nguyen",
    staffIds: ["staff-priya"],
    scores: {
      instructionQuality: 4,
      communication: 2,
      childGrowth: 4,
      organization: 3,
    },
    comment:
      "The teaching is good but we often hear about schedule changes the day before. It's hard with two working parents.",
    // Anonymous: staff must not learn this came from the Nguyen family.
    isAnonymous: true,
    createdAt: "2026-07-14T20:30:00.000Z",
  },
];

export const buttonTemplates: ButtonTemplate[] = [
  {
    id: "tpl-frozen",
    productionId: "prod-frozen",
    name: "Frozen Jr. — Snowflake frame",
    accentColor: "#4f8fd6",
    seasonName: "2026–2027",
    isActive: true,
  },
  {
    id: "tpl-mermaid",
    productionId: "prod-mermaid",
    name: "The Little Mermaid Jr. — Shell frame",
    accentColor: "#2f8f7f",
    seasonName: "2026–2027",
    isActive: true,
  },
];

export const healthForms: HealthForm[] = [
  {
    // Ava has a completed, signed form from LAST season → this season should
    // pre-fill for re-attest instead of starting blank.
    id: "hf-ava-2526",
    studentId: "stu-ava",
    seasonId: "season-2526",
    answers: {
      allergies: "Peanuts — carries EpiPen",
      medications: "None daily",
      medicationAuthorization: true,
      conditions: "None",
      physicianName: "Dr. Elena Vasquez",
      physicianPhone: "703-555-0400",
      insuranceCarrier: "CareFirst BCBS",
      insurancePolicyNumber: "XY123456789",
      emergencyTreatmentConsent: true,
      dietaryRestrictions: "No peanuts (see allergies)",
      accessibilityNeeds: "",
    },
    signedByName: "Sofia Martinez",
    signedAt: "2025-08-20T13:00:00.000Z",
    signedFromIp: "203.0.113.10",
    expiresOn: "2026-06-15",
    createdAt: "2025-08-20T13:00:00.000Z",
    updatedAt: "2025-08-20T13:00:00.000Z",
  },
  {
    // Chidi has a current-season form already signed — appears complete on
    // the admin dashboard and the staff emergency roster.
    id: "hf-chidi-2627",
    studentId: "stu-chidi",
    seasonId: "season-2627",
    answers: {
      allergies: "None",
      medications: "Albuterol inhaler as needed",
      medicationAuthorization: true,
      conditions: "Asthma (exercise-induced)",
      physicianName: "Dr. Sam Osei",
      physicianPhone: "571-555-0300",
      insuranceCarrier: "Kaiser Permanente",
      insurancePolicyNumber: "KP-99881100",
      emergencyTreatmentConsent: true,
      dietaryRestrictions: "",
      accessibilityNeeds: "",
    },
    signedByName: "Ngozi Okafor",
    signedAt: "2026-07-01T15:30:00.000Z",
    signedFromIp: "203.0.113.22",
    expiresOn: "2027-06-15",
    createdAt: "2026-07-01T15:30:00.000Z",
    updatedAt: "2026-07-01T15:30:00.000Z",
  },
];

export const feedPosts: FeedPost[] = [
  {
    id: "post-welcome",
    authorStaffId: "staff-dana",
    authorName: "Dana Whitfield",
    title: "Welcome to the 2026–2027 season! 🎭",
    body: "We are thrilled to kick off our 21st year. Frozen Jr. rehearsals begin the week of September 14 — watch this space for the full calendar, costume fitting signups, and volunteer opportunities. Let's make some magic together!",
    imageUrls: [],
    category: "general",
    audience: {},
    isPinned: true,
    publishedAt: "2026-07-20T14:00:00.000Z",
    reactionCounts: { heart: 14, clap: 6, star: 3 },
  },
  {
    id: "post-frozen-fitting",
    authorStaffId: "staff-jo",
    authorName: "Jo Castillo",
    title: "Frozen Jr. — costume fittings next week",
    body: "Fittings run Tuesday–Thursday, 5:00–7:30 PM in Studio B. Sign up for a 10-minute slot. Please arrive in a fitted t-shirt and leggings/shorts. Questions? Ask below — we answer every one.",
    imageUrls: [],
    category: "rehearsal",
    audience: { productionIds: ["prod-frozen"] },
    isPinned: false,
    publishedAt: "2026-07-24T16:30:00.000Z",
    reactionCounts: { heart: 5, clap: 2, star: 0 },
  },
];

export const postQuestions: PostQuestion[] = [
  {
    id: "q-1",
    postId: "post-frozen-fitting",
    askerUserId: "user-sofia",
    askerName: "Sofia Martinez",
    question: "Can siblings book back-to-back slots?",
    answer: "Yes! Book two adjacent slots and note it in the comment field.",
    answeredByName: "Jo Castillo",
    answeredAt: "2026-07-24T19:00:00.000Z",
    isPublicFaq: true,
    createdAt: "2026-07-24T17:10:00.000Z",
  },
  {
    id: "q-2",
    postId: "post-frozen-fitting",
    askerUserId: "user-minh",
    askerName: "Minh Nguyen",
    question: "Lily has a dance class Tuesday — is Thursday OK for leads?",
    isPublicFaq: false,
    createdAt: "2026-07-25T01:20:00.000Z",
  },
];

export const emailTemplates: EmailTemplate[] = [
  {
    id: "tpl-audition-results",
    name: "Audition results",
    subject: "{{show_title}} casting is here, {{student_first}}! 🎉",
    body: "Dear {{parent_first}},\n\nCasting for {{show_title}} has been posted! Log in to the family hub to see {{student_first}}'s role and the first rehearsal schedule.\n\nEvery role matters — we can't wait to see what this cast creates together.\n\nBreak a leg,\n{{sender_name}}",
    category: "casting",
  },
  {
    id: "tpl-rehearsal-change",
    name: "Rehearsal change",
    subject: "Schedule change: {{show_title}} rehearsal",
    body: "Hi {{parent_first}},\n\nA rehearsal on {{student_first}}'s schedule has changed. New call time: {{call_time}}. The family calendar is already updated.\n\nThanks for rolling with it!\n{{sender_name}}",
    category: "critical",
  },
  {
    id: "tpl-payment-reminder",
    name: "Payment reminder",
    subject: "Friendly reminder: balance due for {{student_first}}",
    body: "Hi {{parent_first}},\n\nA quick note that your account shows an outstanding balance. You can view and pay it from the family hub dashboard.\n\nThank you!\n{{sender_name}}",
    category: "payment",
  },
  {
    id: "tpl-welcome",
    name: "Welcome",
    subject: "Welcome to {{org_name}}, {{parent_first}}!",
    body: "Hi {{parent_first}},\n\nWelcome to the family! Here's how to get started: complete {{student_first}}'s profile, sign the health form, and add the calendar feed to your phone.\n\nSee you at the studio,\n{{sender_name}}",
    category: "newsletter",
  },
  {
    id: "tpl-show-week",
    name: "Show week logistics",
    subject: "Show week! Everything you need for {{show_title}}",
    body: "It's here! 🎭\n\nCall times, drop-off, tickets, and flowers — everything for {{show_title}} show week is in the attached guide and on the family calendar. Call time for {{student_first}}: {{call_time}}.\n\nBreak legs everyone!\n{{sender_name}}",
    category: "critical",
  },
];

export const events: CalendarEvent[] = [
  {
    id: "evt-1",
    type: "rehearsal",
    title: "Frozen Jr. — Full Cast Rehearsal",
    startsAt: "2026-07-28T22:30:00.000Z", // 6:30 PM ET
    endsAt: "2026-07-29T00:30:00.000Z",
    callTime: "2026-07-28T22:15:00.000Z",
    location: "Studio A, Chantilly",
    whatToBring: "Water bottle, jazz shoes, script binder",
    contactName: "Jo Castillo",
    contactEmail: "jo@example.com",
    productionId: "prod-frozen",
    changedAt: "2026-07-25T15:00:00.000Z",
    changeNote: "Moved from 6:00 to 6:30 PM",
  },
  {
    id: "evt-2",
    type: "class",
    title: "Musical Theater Dance — Level 2",
    startsAt: "2026-07-28T21:00:00.000Z", // 5:00 PM ET Tuesday
    endsAt: "2026-07-28T22:00:00.000Z",
    location: "Studio A, Chantilly",
    whatToBring: "Jazz shoes",
    contactName: "Priya Raman",
    classId: "class-mtd2",
  },
  {
    id: "evt-3",
    type: "class",
    title: "Vocal Technique — Beginners",
    startsAt: "2026-07-30T20:30:00.000Z", // 4:30 PM ET Thursday
    endsAt: "2026-07-30T21:30:00.000Z",
    location: "Studio B, Chantilly",
    contactName: "Marcus Lee",
    classId: "class-voice1",
  },
];
