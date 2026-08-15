/**
 * Seed the shared Supabase database (public schema ONLY — never touches
 * staff_portal) with the same demo world the mock provider uses, so every
 * ported adapter method can be exercised against real Postgres.
 *
 * - Wipes family-hub tables first (idempotent re-runs)
 * - Creates real auth accounts for the demo users (@example.com), password
 *   NovapaDemo2026! — wiped before real family data ever loads
 * - Rewrites the seed's string ids ("fam-martinez") to real UUIDs, keeping
 *   every relationship intact
 *
 * Run: npx tsx scripts/seed-supabase.ts
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import * as seed from "../src/lib/api/mock/seed-data";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
// Schema-pinned: on novapa the family hub lives in the `family_hub` schema,
// so this client physically cannot reach the website's public tables or the
// staff portal. (Set NEXT_PUBLIC_SUPABASE_SCHEMA=public for novapa-deh.)
const db = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});

const DEMO_PASSWORD = "NovapaDemo2026!";

/** seed string id → real uuid */
const ids = new Map<string, string>();
const uid = (seedId: string): string => {
  if (!ids.has(seedId)) ids.set(seedId, randomUUID());
  return ids.get(seedId)!;
};
const uidOrNull = (seedId?: string) => (seedId ? uid(seedId) : null);

async function insert(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`${table} insert failed: ${error.message}`);
  console.log(`  ${table}: ${rows.length}`);
}

async function wipe() {
  // Children before parents. Only family-hub tables — the staff portal's
  // schema is not reachable from this client and is never listed here.
  const order: Array<[string, string]> = [
    ["messages", "id"], ["message_threads", "id"],
    ["lesson_bookings", "id"], ["lesson_slots", "id"],
    ["event_notices", "event_key"],
    ["casting_confirmations", "id"], ["casting_boards", "production_id"],
    ["show_scenes", "id"], ["show_history", "id"],
    ["casting_assignments", "id"],
    ["audition_evaluations", "id"], ["audition_profiles", "id"],
    ["show_roles", "id"], ["products", "id"],
    ["hopes_entries", "id"], ["enrollments", "id"],
    ["calendar_events", "id"], ["class_staff", "class_id"],
    ["classes", "id"], ["productions", "id"],
    ["notifications", "id"], ["notification_prefs", "user_id"],
    ["family_calendar_tokens", "family_id"],
    ["health_forms", "id"], ["pickup_requests", "id"],
    ["post_questions", "id"], ["feed_posts", "id"],
    ["family_documents", "id"], ["guardians", "id"],
    ["students", "id"], ["profiles", "id"],
    ["families", "id"],
    ["staff_program_assignments", "staff_id"], ["staff_profiles", "id"],
    ["programs", "id"], ["seasons", "id"],
    ["family_hub_invites", "email"],
  ];
  // Tables with no cascading parent in the list above — wipe explicitly so
  // reseeds never accumulate duplicates.
  order.unshift(
    ["reviews", "id"], ["review_windows", "id"],
    ["products", "id"], ["button_templates", "id"]
  );
  for (const [table, pk] of order) {
    const { error } = await db.from(table).delete().not(pk, "is", null);
    if (error) throw new Error(`wipe ${table} failed: ${error.message}`);
  }
  console.log("  wiped family-hub tables");

  // Remove previous demo auth accounts (@example.com only).
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  for (const user of data.users) {
    if (user.email?.endsWith("@example.com")) {
      await db.auth.admin.deleteUser(user.id);
    }
  }
  console.log("  wiped demo auth accounts");
}

async function main() {
  console.log("Wiping…");
  await wipe();

  console.log("Seeding…");

  await insert("seasons", seed.seasons.map((x) => ({
    id: uid(x.id), name: x.name, starts_on: x.startsOn, ends_on: x.endsOn,
    is_current: x.isCurrent,
  })));

  await insert("programs", seed.programs.map((x) => ({
    id: uid(x.id), season_id: uid(x.seasonId), name: x.name, description: x.description,
  })));

  // Invites first: the signup guard on auth.users only admits emails on
  // the staff portal's access list OR in family_hub_invites.
  await insert("family_hub_invites", seed.users.map((x) => ({
    email: x.email,
    note: "demo seed",
  })));

  // Auth accounts — profiles.id must equal the auth user id. Real accounts
  // that already exist (e.g. Tony's staff-portal login) are REUSED, never
  // recreated and never touched — their password stays whatever it is.
  const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const user of seed.users) {
    const found = existing?.users.find(
      (u) => u.email?.toLowerCase() === user.email.toLowerCase()
    );
    if (found) {
      ids.set(user.id, found.id);
      console.log(`  auth user ${user.email}: reusing existing account`);
      continue;
    }
    const { data, error } = await db.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: user.displayName },
    });
    if (error) throw new Error(`auth user ${user.email} failed: ${error.message}`);
    ids.set(user.id, data.user.id);
  }
  console.log(`  auth users: ${seed.users.length}`);

  await insert("families", seed.families.map((x) => ({
    id: uid(x.id), name: x.name,
    address_line1: x.addressLine1 ?? "", address_line2: x.addressLine2 ?? null,
    city: x.city ?? "", state: x.state ?? "VA", zip: x.zip ?? "",
    preferred_contact_method: x.preferredContactMethod ?? "email",
    communication_language: x.communicationLanguage ?? "en",
    staff_notes: x.staffNotes ?? null,
    emergency_contacts: x.emergencyContacts ?? [],
    authorized_pickups: x.authorizedPickups ?? [],
  })));

  await insert("profiles", seed.users.map((x) => ({
    id: uid(x.id), email: x.email, display_name: x.displayName, role: x.role,
    family_id: uidOrNull(x.familyId), staff_id: uidOrNull(x.staffId),
  })));

  // After profiles: staff_profiles.user_id references profiles(id).
  await insert("staff_profiles", seed.staffProfiles.map((x) => ({
    id: uid(x.id), user_id: uidOrNull(x.userId), full_name: x.fullName,
    title: x.title, bio: x.bio, photo_url: x.photoUrl ?? null,
    specialties: x.specialties ?? [], credits: x.credits ?? null,
    is_published: x.isPublished ?? true,
    is_health_safety_director: x.isHealthSafetyDirector ?? false,
  })));

  await insert("guardians", seed.guardians.map((x) => ({
    id: uid(x.id), family_id: uid(x.familyId), user_id: uidOrNull(x.userId),
    full_name: x.fullName, email: x.email, phone: x.phone ?? "",
    relationship: x.relationship ?? "", is_primary: x.isPrimary ?? false,
  })));

  await insert("students", seed.students.map((x) => ({
    id: uid(x.id), family_id: uid(x.familyId),
    first_name: x.firstName, last_name: x.lastName,
    preferred_name: x.preferredName ?? null, pronouns: x.pronouns ?? null,
    date_of_birth: x.dateOfBirth, grade: x.grade ?? "", school: x.school ?? null,
    tshirt_size: x.tshirtSize ?? null, allergies: x.allergies ?? null,
    medical_flags: x.medicalFlags ?? null,
    resume_credits: x.resumeCredits ?? [],
    vocal_range: x.vocalRange ?? null, dance_experience: x.danceExperience ?? null,
    consent_photo_use: x.consents?.photoUse ?? false,
    consent_face_matching: x.consents?.faceMatching ?? false,
    consent_directory_visible: x.consents?.directoryVisible ?? false,
    has_login: x.hasLogin ?? false,
  })));

  await insert("classes", seed.classes.map((x) => ({
    id: uid(x.id), program_id: uid(x.programId), name: x.name,
    day_of_week: x.dayOfWeek, start_time: x.startTime, end_time: x.endTime,
    location: x.location ?? "",
  })));

  await insert("class_staff", seed.classes.flatMap((x) =>
    (x.staffIds ?? []).map((staffId) => ({ class_id: uid(x.id), staff_id: uid(staffId) }))
  ));

  await insert("productions", seed.productions.map((x) => ({
    id: uid(x.id), program_id: uid(x.programId),
    season_id: uid(seed.programs.find((p) => p.id === x.programId)!.seasonId),
    title: x.title, venue: x.venue ?? "",
    director_staff_id: uidOrNull(x.directorStaffId),
    opens_on: x.opensOn ?? null, closes_on: x.closesOn ?? null,
    tickets_url: x.ticketsUrl ?? null,
  })));

  await insert("enrollments", seed.enrollments.map((x) => ({
    id: uid(x.id), student_id: uid(x.studentId),
    class_id: uidOrNull(x.classId), production_id: uidOrNull(x.productionId),
    status: x.status, balance_cents: x.balanceCents ?? 0,
    source: x.source === "registration_portal" ? "registration_portal" : "manual",
  })));

  await insert("show_roles", seed.showRoles.map((x) => ({
    id: uid(x.id), production_id: uid(x.productionId), name: x.name,
    tier: x.tier, description: x.description ?? "",
    capacity: x.capacity, sort_order: x.sortOrder ?? 0,
  })));

  await insert("show_scenes", seed.showScenes.map((x) => ({
    id: uid(x.id), production_id: uid(x.productionId), name: x.name,
    kind: x.kind, role_ids: x.roleIds.map((r) => uid(r)),
    sort_order: x.sortOrder ?? 0,
  })));

  await insert("casting_assignments", seed.casting.map((x) => ({
    id: uid(x.id), production_id: uid(x.productionId), student_id: uid(x.studentId),
    character_name: x.characterName, cast_group: x.castGroup ?? null,
    is_understudy: x.isUnderstudy ?? false,
    rehearsal_track: x.rehearsalTrack ?? null,
    published_at: x.publishedAt ?? null,
  })));

  await insert("show_history", seed.showHistory.map((x) => ({
    id: uid(x.id), student_id: uid(x.studentId),
    production_title: x.productionTitle, role: x.role,
    season_name: x.seasonName ?? "", director: x.director ?? null,
    venue: x.venue ?? null, organization: x.organization ?? null,
    from_casting: x.fromCasting ?? false, year: x.year ?? "",
  })));

  await insert("calendar_events", seed.events.map((x) => ({
    id: uid(x.id), type: x.type, title: x.title,
    starts_at: x.startsAt, ends_at: x.endsAt, call_time: x.callTime ?? null,
    location: x.location ?? "", what_to_bring: x.whatToBring ?? null,
    contact_name: x.contactName ?? null,
    class_id: uidOrNull(x.classId), production_id: uidOrNull(x.productionId),
    scene_ids: x.sceneIds ? x.sceneIds.map((sc) => uid(sc)) : null,
  })));

  await insert("lesson_slots", seed.lessonSlots.map((x) => ({
    id: uid(x.id), teacher_staff_id: uid(x.teacherStaffId),
    discipline: x.discipline, weekday: x.weekday, start_time: x.startTime,
    duration_min: x.durationMin, location: x.location,
    price_per_lesson_cents: x.pricePerLessonCents,
  })));

  await insert("button_templates", seed.buttonTemplates.map((x) => ({
    id: uid(x.id), production_id: uid(x.productionId), name: x.name,
    frame_image_url: x.frameImageUrl ?? null, logo_url: x.logoUrl ?? null,
    accent_color: x.accentColor ?? "#8e1f2f", season_name: x.seasonName ?? "",
    is_active: x.isActive ?? true,
  })));

  await insert("products", seed.products.map((x) => ({
    id: uid(x.id), type: x.type, name: x.name, description: x.description ?? "",
    base_price_cents: x.basePriceCents,
    production_id: x.productionId ? uid(x.productionId) : null,
    is_active: x.isActive ?? true,
    config: {
      options: x.options ?? [], optionLabel: x.optionLabel,
      requiresPhoto: x.requiresPhoto ?? false,
      requiresMessage: x.requiresMessage ?? false,
      messageLabel: x.messageLabel, messageMaxLength: x.messageMaxLength,
    },
  })));

  await insert("review_windows", seed.reviewWindows.map((x) => ({
    id: uid(x.id), kind: x.kind, subject_type: x.subjectType,
    subject_id: uid(x.subjectId), opens_at: x.opensAt, closes_at: x.closesAt,
  })));

  await insert("reviews", seed.reviews.map((x) => ({
    id: uid(x.id), window_id: uid(x.windowId), subject_type: x.subjectType,
    subject_id: uid(x.subjectId), reviewer_user_id: uid(x.reviewerUserId),
    reviewer_name: x.reviewerName, family_id: uid(x.familyId),
    staff_ids: (x.staffIds ?? []).map((sid) => uid(sid)),
    instruction_quality: x.scores.instructionQuality,
    communication: x.scores.communication,
    child_growth: x.scores.childGrowth,
    organization: x.scores.organization,
    comment: x.comment ?? "", is_anonymous: x.isAnonymous ?? false,
    created_at: x.createdAt,
  })));

  console.log("Done. Demo sign-in: any seed email (e.g. dana@example.com / sofia@example.com) with password", DEMO_PASSWORD);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
