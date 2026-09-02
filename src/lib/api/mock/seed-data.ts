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
import type { Product } from "../store/catalog";
import type { ShowRole, ShowScene } from "../auditions/types";
import type { LessonSlot } from "../lessons/types";

/**
 * Realiztic demo data: three families, five students, four staff,
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
  {
    // The real autumn 2026 Teen Conservatory show. Seeded so the
    // Sweeney-specific surfaces — rehearsal tracks and the scene/song
    // breakdown — are reachable in mock mode. Dates are the ones on the
    // production calendar: opening 10/23, closing 11/1.
    id: "prod-sweeney",
    programId: "prog-bb-fall",
    title: "Sweeney Todd - Teen Conservatory",
    seasonId: "season-2627",
    venue: "Loudoun Auditorium, National Conference Center",
    directorStaffId: "staff-marcus",
    opensOn: "2026-10-23",
    closesOn: "2026-11-01",
    ticketsUrl: "https://novapa.booktix.com",
    // The two folders that actually exist. Staging is left undefined on
    // purpose: no such folder has been made, and mock mode should show the
    // gap rather than paper over it with a link that would 404 in real life.
    clickTracksUrl: "https://drive.google.com/drive/folders/1SlBqgmdoytb17sqWkPP8XyBiRXvJzcmG?usp=sharing",
    choreographyUrl: "https://drive.google.com/drive/folders/1Q3_LGEBnZASNZeMoY1rDyAvb-hlctWXy",
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
    title: "Stage Manager & Director of Health and Safety",
    bio: "Keeps the trains (and tech weeks) running on time.",
    specialties: ["Stage Management", "Production Ops"],
    isHealthSafetyDirector: true,
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
  { id: "enr-1", studentId: "stu-ava", productionId: "prod-frozen", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "camp", amountPaidCents: 45000, createdAt: T0 },
  { id: "enr-2", studentId: "stu-ava", classId: "class-mtd2", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "class", amountPaidCents: 22000, createdAt: T0 },
  { id: "enr-3", studentId: "stu-leo", productionId: "prod-frozen", status: "enrolled", balanceCents: 7500, source: "registration_portal", offeringCategory: "camp", amountPaidCents: 37500, createdAt: T0 },
  { id: "enr-4", studentId: "stu-chidi", productionId: "prod-frozen", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "camp", amountPaidCents: 45000, createdAt: T0 },
  { id: "enr-5", studentId: "stu-chidi", classId: "class-voice1", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "coaching", amountPaidCents: 18000, createdAt: T0 },
  { id: "enr-6", studentId: "stu-amara", classId: "class-mtd2", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "class", amountPaidCents: 22000, createdAt: T0 },
  { id: "enr-7", studentId: "stu-lien", productionId: "prod-frozen", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "camp", amountPaidCents: 45000, createdAt: T0 },
  // Teen Conservatory — puts a Sweeney calendar on a demo family so the
  // production dashboard and its schedule rail have something to show.
  { id: "enr-8", studentId: "stu-ava", productionId: "prod-sweeney", status: "enrolled", balanceCents: 0, source: "registration_portal", offeringCategory: "performance", amountPaidCents: 60000, createdAt: T0 },
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

/**
 * Disney's Frozen JR. role list, per the MTI character breakdown.
 * Named characters hold one student; ensemble groups hold many.
 * Tier labels follow the org's definitions (see auditions/types.ts).
 */
export const showRoles: ShowRole[] = [
  // Leads / tracked roles
  { id: "role-elsa", productionId: "prod-frozen", name: "Elsa", tier: "lead", description: "Queen of Arendelle. Requires strong solo vocals ('Let It Go').", capacity: 1, sortOrder: 1 },
  { id: "role-anna", productionId: "prod-frozen", name: "Anna", tier: "lead", description: "Elsa's fearless younger sister. Comedic timing and strong vocals.", capacity: 1, sortOrder: 2 },
  { id: "role-kristoff", productionId: "prod-frozen", name: "Kristoff", tier: "lead", description: "Rugged ice harvester. Scene partner through Act 2.", capacity: 1, sortOrder: 3 },
  { id: "role-olaf", productionId: "prod-frozen", name: "Olaf", tier: "lead", description: "A snowman who loves summer. Big comedic presence ('In Summer').", capacity: 1, sortOrder: 4 },
  { id: "role-hans", productionId: "prod-frozen", name: "Hans", tier: "lead", description: "Charming prince with a turn. Duet vocals ('Love Is an Open Door').", capacity: 1, sortOrder: 5 },

  // Supporting roles
  { id: "role-young-anna", productionId: "prod-frozen", name: "Young Anna", tier: "supporting", description: "Anna as a child. Opens the show ('Do You Want to Build a Snowman?').", capacity: 1, sortOrder: 10 },
  { id: "role-young-elsa", productionId: "prod-frozen", name: "Young Elsa", tier: "supporting", description: "Elsa as a child. Emotional early scenes.", capacity: 1, sortOrder: 11 },
  { id: "role-middle-anna", productionId: "prod-frozen", name: "Middle Anna", tier: "supporting", description: "Anna growing up. Bridges the sisters' story.", capacity: 1, sortOrder: 12 },
  { id: "role-middle-elsa", productionId: "prod-frozen", name: "Middle Elsa", tier: "supporting", description: "Elsa growing up, learning to hide her powers.", capacity: 1, sortOrder: 13 },
  { id: "role-sven", productionId: "prod-frozen", name: "Sven", tier: "supporting", description: "Kristoff's loyal reindeer. Physical performance.", capacity: 1, sortOrder: 14 },
  { id: "role-duke", productionId: "prod-frozen", name: "Duke of Weselton", tier: "supporting", description: "Scheming visiting dignitary. Character comedy.", capacity: 1, sortOrder: 15 },
  { id: "role-oaken", productionId: "prod-frozen", name: "Oaken", tier: "supporting", description: "Warm trading-post owner ('Hygge').", capacity: 1, sortOrder: 16 },
  { id: "role-pabbie", productionId: "prod-frozen", name: "Pabbie", tier: "supporting", description: "Wise leader of the Hidden Folk.", capacity: 1, sortOrder: 17 },
  { id: "role-bulda", productionId: "prod-frozen", name: "Bulda", tier: "supporting", description: "Lively Hidden Folk leader; humor in group scenes.", capacity: 1, sortOrder: 18 },

  // Featured roles
  { id: "role-agnarr", productionId: "prod-frozen", name: "King Agnarr", tier: "featured", description: "The sisters' father.", capacity: 1, sortOrder: 20 },
  { id: "role-iduna", productionId: "prod-frozen", name: "Queen Iduna", tier: "featured", description: "The sisters' mother.", capacity: 1, sortOrder: 21 },
  { id: "role-bishop", productionId: "prod-frozen", name: "Bishop", tier: "featured", description: "Crowns Elsa at the coronation.", capacity: 1, sortOrder: 22 },
  { id: "role-kai", productionId: "prod-frozen", name: "Kai", tier: "featured", description: "Castle steward with featured lines.", capacity: 1, sortOrder: 23 },
  { id: "role-gerda", productionId: "prod-frozen", name: "Gerda", tier: "featured", description: "Castle staff with featured lines.", capacity: 1, sortOrder: 24 },

  // Ensemble groups (multiple students each)
  { id: "role-hidden-folk", productionId: "prod-frozen", name: "Hidden Folk", tier: "ensemble", description: "The mystical family who raise Kristoff.", capacity: null, sortOrder: 30 },
  { id: "role-townspeople", productionId: "prod-frozen", name: "Townspeople of Arendelle", tier: "ensemble", description: "Coronation day and village scenes.", capacity: null, sortOrder: 31 },
  { id: "role-castle-staff", productionId: "prod-frozen", name: "Castle Staff", tier: "ensemble", description: "Servants and stewards of the castle.", capacity: null, sortOrder: 32 },
  { id: "role-snow-chorus", productionId: "prod-frozen", name: "Snow Chorus", tier: "ensemble", description: "Elsa's magic given voice ('Vuelie', 'Let It Go').", capacity: null, sortOrder: 33 },
  { id: "role-summer-chorus", productionId: "prod-frozen", name: "Summer Chorus", tier: "ensemble", description: "Olaf's summer daydream ('In Summer').", capacity: null, sortOrder: 34 },
  { id: "role-oakens-family", productionId: "prod-frozen", name: "Oaken's Family", tier: "ensemble", description: "The sauna family ('Hygge').", capacity: null, sortOrder: 35 },
];

/**
 * Frozen JR. musical numbers per the MTI breakdown, mapped to roles.
 * Serves as the seeded "curriculum" until admins upload their own; drives
 * the parent-facing "what is my child in" view and per-child rehearsal
 * calendars. Ensemble groups are called by group.
 */
const ALL_ENSEMBLE = [
  "role-townspeople",
  "role-castle-staff",
  "role-hidden-folk",
  "role-snow-chorus",
  "role-summer-chorus",
  "role-oakens-family",
];

export const showScenes: ShowScene[] = [
  { id: "scn-vuelie", productionId: "prod-frozen", name: "Vuelie / Let the Sun Shine On", kind: "song", sortOrder: 1, roleIds: ["role-young-anna", "role-young-elsa", "role-agnarr", "role-iduna", ...ALL_ENSEMBLE] },
  { id: "scn-little-bit", productionId: "prod-frozen", name: "A Little Bit of You", kind: "song", sortOrder: 2, roleIds: ["role-young-anna", "role-young-elsa"] },
  { id: "scn-pabbie-heal", productionId: "prod-frozen", name: "Pabbie's Healing (Scene)", kind: "scene", sortOrder: 3, roleIds: ["role-young-anna", "role-young-elsa", "role-agnarr", "role-iduna", "role-pabbie", "role-bulda", "role-hidden-folk"] },
  { id: "scn-snowman", productionId: "prod-frozen", name: "Do You Want to Build a Snowman?", kind: "song", sortOrder: 4, roleIds: ["role-young-anna", "role-middle-anna", "role-anna", "role-young-elsa", "role-middle-elsa", "role-elsa", "role-agnarr", "role-iduna"] },
  { id: "scn-first-time", productionId: "prod-frozen", name: "For the First Time in Forever", kind: "song", sortOrder: 5, roleIds: ["role-anna", "role-elsa", "role-kai", "role-gerda", "role-castle-staff", "role-townspeople"] },
  { id: "scn-dangerous", productionId: "prod-frozen", name: "Dangerous to Dream", kind: "song", sortOrder: 6, roleIds: ["role-elsa", "role-anna", "role-bishop", "role-townspeople", "role-castle-staff"] },
  { id: "scn-open-door", productionId: "prod-frozen", name: "Love Is an Open Door", kind: "song", sortOrder: 7, roleIds: ["role-anna", "role-hans"] },
  { id: "scn-coronation", productionId: "prod-frozen", name: "Coronation Confrontation (Scene)", kind: "scene", sortOrder: 8, roleIds: ["role-elsa", "role-anna", "role-hans", "role-duke", "role-townspeople", "role-castle-staff"] },
  { id: "scn-reindeers", productionId: "prod-frozen", name: "Reindeer(s) Are Better Than People", kind: "song", sortOrder: 9, roleIds: ["role-kristoff", "role-sven"] },
  { id: "scn-summer", productionId: "prod-frozen", name: "In Summer", kind: "song", sortOrder: 10, roleIds: ["role-olaf", "role-anna", "role-kristoff", "role-sven", "role-summer-chorus"] },
  { id: "scn-hygge", productionId: "prod-frozen", name: "Hygge", kind: "song", sortOrder: 11, roleIds: ["role-oaken", "role-anna", "role-kristoff", "role-olaf", "role-sven", "role-oakens-family"] },
  { id: "scn-let-it-go", productionId: "prod-frozen", name: "Let It Go", kind: "song", sortOrder: 12, roleIds: ["role-elsa", "role-snow-chorus"] },
  { id: "scn-lullaby", productionId: "prod-frozen", name: "Kristoff Lullaby", kind: "song", sortOrder: 13, roleIds: ["role-kristoff", "role-anna"] },
  { id: "scn-fixer-upper", productionId: "prod-frozen", name: "Fixer Upper", kind: "song", sortOrder: 14, roleIds: ["role-kristoff", "role-anna", "role-olaf", "role-pabbie", "role-bulda", "role-hidden-folk"] },
  { id: "scn-colder", productionId: "prod-frozen", name: "Colder by the Minute", kind: "song", sortOrder: 15, roleIds: ["role-anna", "role-elsa", "role-hans", "role-kristoff", "role-olaf", "role-duke", ...ALL_ENSEMBLE] },
  { id: "scn-finale", productionId: "prod-frozen", name: "Finale / Let It Go (Reprise)", kind: "song", sortOrder: 16, roleIds: ["role-anna", "role-elsa", "role-kristoff", "role-olaf", "role-sven", "role-hans", "role-duke", "role-oaken", "role-pabbie", "role-bulda", "role-young-anna", "role-young-elsa", "role-middle-anna", "role-middle-elsa", "role-agnarr", "role-iduna", "role-bishop", "role-kai", "role-gerda", ...ALL_ENSEMBLE] },
];

/**
 * Weekly recurring private-lesson slots — same teacher, same time every
 * week until the family cancels. Times are studio-local Eastern.
 */
export const lessonSlots: LessonSlot[] = [
  // Marcus Lee — voice (Music Director)
  { id: "ls-1", teacherStaffId: "staff-marcus", discipline: "voice", weekday: 2, startTime: "16:30", durationMin: 30, location: "Studio B, Chantilly", pricePerLessonCents: 4500 },
  { id: "ls-2", teacherStaffId: "staff-marcus", discipline: "voice", weekday: 2, startTime: "17:00", durationMin: 30, location: "Studio B, Chantilly", pricePerLessonCents: 4500 },
  { id: "ls-3", teacherStaffId: "staff-marcus", discipline: "voice", weekday: 2, startTime: "17:30", durationMin: 30, location: "Studio B, Chantilly", pricePerLessonCents: 4500 },
  { id: "ls-4", teacherStaffId: "staff-marcus", discipline: "voice", weekday: 3, startTime: "16:30", durationMin: 30, location: "Studio B, Chantilly", pricePerLessonCents: 4500 },
  { id: "ls-5", teacherStaffId: "staff-marcus", discipline: "voice", weekday: 3, startTime: "17:00", durationMin: 30, location: "Studio B, Chantilly", pricePerLessonCents: 4500 },
  // Dana Whitfield — acting (Artistic Director)
  { id: "ls-6", teacherStaffId: "staff-dana", discipline: "acting", weekday: 4, startTime: "17:00", durationMin: 45, location: "Studio A, Chantilly", pricePerLessonCents: 6000 },
  { id: "ls-7", teacherStaffId: "staff-dana", discipline: "acting", weekday: 4, startTime: "17:45", durationMin: 45, location: "Studio A, Chantilly", pricePerLessonCents: 6000 },
  // Priya Raman — dance (Choreographer & Teaching Artist)
  { id: "ls-8", teacherStaffId: "staff-priya", discipline: "dance", weekday: 1, startTime: "17:00", durationMin: 45, location: "Studio A, Chantilly", pricePerLessonCents: 5500 },
  { id: "ls-9", teacherStaffId: "staff-priya", discipline: "dance", weekday: 1, startTime: "17:45", durationMin: 45, location: "Studio A, Chantilly", pricePerLessonCents: 5500 },
];

export const products: Product[] = [
  {
    id: "prod-starpage-frozen",
    type: "star_page",
    name: "Star page — Frozen Jr. playbill",
    description:
      "A congratulatory page in the show program. Add a photo and a message from the family.",
    basePriceCents: 3500,
    productionId: "prod-frozen",
    optionLabel: "Page size",
    options: [
      { value: "quarter", label: "Quarter page", priceDeltaCents: 0, description: "Photo + short message" },
      { value: "half", label: "Half page", priceDeltaCents: 2500, description: "Larger photo, longer message" },
      { value: "full", label: "Full page", priceDeltaCents: 6500, description: "Full-page tribute" },
    ],
    requiresPhoto: true,
    requiresMessage: true,
    messageLabel: "Your message",
    messageMaxLength: 400,
    isActive: true,
    sortOrder: 10,
  },
  {
    id: "prod-voice-lessons",
    type: "private_lesson",
    name: "Private voice lessons",
    description:
      "One-to-one vocal coaching with a NOVA PA music director. Scheduled with you after purchase.",
    basePriceCents: 6500,
    optionLabel: "Package",
    options: [
      { value: "single-30", label: "Single 30-minute lesson", priceDeltaCents: 0 },
      { value: "single-60", label: "Single 60-minute lesson", priceDeltaCents: 5500 },
      { value: "pack4-30", label: "4 × 30-minute lessons", priceDeltaCents: 18500, description: "Save $10" },
      { value: "pack4-60", label: "4 × 60-minute lessons", priceDeltaCents: 41500, description: "Save $20" },
    ],
    requiresPhoto: false,
    requiresMessage: false,
    staffIds: ["staff-marcus"],
    isActive: true,
    sortOrder: 20,
  },
  {
    id: "prod-acting-lessons",
    type: "private_lesson",
    name: "Private acting coaching",
    description:
      "Monologue work, audition prep, and scene study with a teaching artist.",
    basePriceCents: 6500,
    optionLabel: "Package",
    options: [
      { value: "single-30", label: "Single 30-minute session", priceDeltaCents: 0 },
      { value: "single-60", label: "Single 60-minute session", priceDeltaCents: 5500 },
      { value: "pack4-60", label: "4 × 60-minute sessions", priceDeltaCents: 41500, description: "Save $20" },
      { value: "audition-prep", label: "Audition prep intensive", priceDeltaCents: 12500, description: "Two 60-minute sessions before an audition" },
    ],
    requiresPhoto: false,
    requiresMessage: false,
    staffIds: ["staff-dana", "staff-priya"],
    isActive: true,
    sortOrder: 30,
  },
  {
    id: "prod-dance-lessons",
    type: "private_lesson",
    name: "Private dance coaching",
    description: "Choreography clean-up, technique, and callback preparation.",
    basePriceCents: 6500,
    optionLabel: "Package",
    options: [
      { value: "single-30", label: "Single 30-minute session", priceDeltaCents: 0 },
      { value: "single-60", label: "Single 60-minute session", priceDeltaCents: 5500 },
      { value: "pack4-60", label: "4 × 60-minute sessions", priceDeltaCents: 41500 },
    ],
    requiresPhoto: false,
    requiresMessage: false,
    staffIds: ["staff-priya"],
    isActive: true,
    sortOrder: 40,
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
  {
    // Tagged to one show, so it appears on that show's feed and nowhere
    // else — the two-feeds rule the show page depends on.
    id: "post-sweeney-tracks",
    authorStaffId: "staff-marcus",
    authorName: "Colton Sorensen",
    title: "Rehearsal tracks are live — start with the Ballad",
    body: "The MTI code is on the show page. Download the tracks to a phone before Monday rather than streaming in the room; the wifi in the South Building will not carry twenty devices.\n\nEverybody learns the Prologue first. Leads, your character block dates are on the show page too.",
    imageUrls: [],
    category: "rehearsal",
    audience: { productionIds: ["prod-sweeney"] },
    isPinned: true,
    publishedAt: "2026-08-14T13:00:00.000Z",
    reactionCounts: { heart: 9, clap: 4, star: 2 },
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

/**
 * A slice of the real Sweeney Todd calendar, taken from the production's own
 * Google Calendar feed. Enough to exercise the schedule rail in mock mode:
 * the move from the rehearsal space to Loudoun Auditorium, a tech call, and
 * opening night.
 */
const sweeneyEvents: CalendarEvent[] = [
  {
    id: "evt-sw-1",
    type: "rehearsal",
    title: "Rehearsal — Rm A / Rm B",
    startsAt: "2026-09-24T23:00:00.000Z",
    endsAt: "2026-09-25T01:00:00.000Z",
    location: "Rehearsal Space, South Building, National Conference Center",
    whatToBring: "Script, pencil, water",
    productionId: "prod-sweeney",
  },
  {
    id: "evt-sw-2",
    type: "rehearsal",
    title: "ACT I RUN (full company)",
    startsAt: "2026-09-27T17:00:00.000Z",
    endsAt: "2026-09-27T19:00:00.000Z",
    location: "Rehearsal Space, South Building, National Conference Center",
    productionId: "prod-sweeney",
  },
  {
    id: "evt-sw-3",
    type: "rehearsal",
    title: "COSTUME PARADE (ALL PROPS DUE)",
    startsAt: "2026-10-04T17:00:00.000Z",
    endsAt: "2026-10-04T19:00:00.000Z",
    location: "Loudoun Auditorium, National Conference Center",
    whatToBring: "Every costume piece and prop",
    productionId: "prod-sweeney",
    changedAt: "2026-08-16T12:00:00.000Z",
    changeNote: "First call in the auditorium — not the rehearsal space",
  },
  {
    id: "evt-sw-4",
    type: "rehearsal",
    title: "TECH: ACT I (MANDATORY)",
    startsAt: "2026-10-19T21:30:00.000Z",
    endsAt: "2026-10-20T01:00:00.000Z",
    location: "Loudoun Auditorium, National Conference Center",
    productionId: "prod-sweeney",
  },
  {
    id: "evt-sw-5",
    type: "performance",
    title: "OPENING NIGHT",
    startsAt: "2026-10-23T23:00:00.000Z",
    endsAt: "2026-10-24T01:30:00.000Z",
    callTime: "2026-10-23T21:30:00.000Z",
    location: "Loudoun Auditorium, National Conference Center",
    productionId: "prod-sweeney",
  },
  {
    id: "evt-sw-6",
    type: "performance",
    title: "MATINEE",
    startsAt: "2026-10-24T18:00:00.000Z",
    endsAt: "2026-10-24T20:30:00.000Z",
    callTime: "2026-10-24T16:30:00.000Z",
    location: "Loudoun Auditorium, National Conference Center",
    productionId: "prod-sweeney",
  },
];

export const events: CalendarEvent[] = [
  ...sweeneyEvents,
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
  // Scene-tagged rehearsals: these appear only on the calendars of
  // students whose role is called — the per-child schedule in action.
  {
    id: "evt-4",
    type: "rehearsal",
    title: "Frozen Jr. — 'Let It Go' & Snow Chorus",
    startsAt: "2026-07-29T22:00:00.000Z", // 6:00 PM ET Wednesday
    endsAt: "2026-07-29T23:30:00.000Z",
    callTime: "2026-07-29T21:45:00.000Z",
    location: "Studio A, Chantilly",
    whatToBring: "Water, jazz shoes, Act 1 music",
    contactName: "Jo Castillo",
    productionId: "prod-frozen",
    sceneIds: ["scn-let-it-go"],
  },
  {
    id: "evt-5",
    type: "rehearsal",
    title: "Frozen Jr. — 'Love Is an Open Door' (Anna/Hans)",
    startsAt: "2026-07-31T22:00:00.000Z", // 6:00 PM ET Friday
    endsAt: "2026-07-31T23:00:00.000Z",
    callTime: "2026-07-31T21:50:00.000Z",
    location: "Studio B, Chantilly",
    whatToBring: "Script, pencil",
    contactName: "Dana Whitfield",
    productionId: "prod-frozen",
    sceneIds: ["scn-open-door"],
  },
];
