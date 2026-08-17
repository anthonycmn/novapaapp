import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessDeniedError, type DataProvider } from "../provider";
import { BUTTON_PRICES_CENTS } from "../types";
import { priceFor, type Customization, type Product } from "../store/catalog";
import type {
  AppNotification,
  ButtonDesign,
  ButtonOrder,
  ButtonTemplate,
  CalendarEvent,
  CartItem,
  FeedAudience,
  OrderItem,
  OrderStatus,
  FeedCategory,
  CastingAssignment,
  ClassOffering,
  EmailSend,
  EmailTemplate,
  Enrollment,
  FeedPost,
  Program,
  Season,
  Guardian,
  HealthForm,
  ResumeCredit,
  HopesEntry,
  NotificationPrefs,
  PickupRequest,
  ShowHistoryEntry,
  PostQuestion,
  ReactionKind,
  Family,
  FamilyCalendarEvent,
  StaffProfile,
  Student,
  User,
  Production,
} from "../types";
import {
  LESSON_CALENDAR_WEEKS,
  LESSON_DISCIPLINES,
  nextLessonOccurrence,
  upcomingLessonOccurrences,
  type LessonBooking,
  type LessonSlot,
} from "../lessons/types";
import {
  CONFIRMATION_REMINDER_MS,
  RECOMMENDATION_THRESHOLD,
  RUBRIC_CRITERIA,
  type AuditionEvaluation,
  type AuditionProfile,
  type CastingBoard,
  type CastingConfirmation,
  type Discipline,
  type GrowthRecommendation,
  type RoleTier,
  type ShowRole,
  type ShowScene,
} from "../auditions/types";
import type {
  Message,
  MessageThread,
  ThreadWithMessages,
} from "../messages/types";
import type { DocumentCategory, FamilyDocument } from "../documents/types";
import { getFaceMatchProvider } from "../photos/face-provider";
import { reconcile } from "../registration/reconcile";
import { fetchCoachingActivityIds } from "../registration/website";
import type {
  AccountLink,
  RegistrationSnapshot,
  RegistrationSource,
  SyncRun,
} from "../registration/types";
import { buildFsaStatement } from "../documents/fsa";
import type { FsaStatement } from "../documents/types";
import { matchFace, type CandidateStudent } from "../photos/matching";
import {
  MAX_REFERENCE_PHOTOS,
  MIN_REFERENCE_PHOTOS,
  type ConsentEvent,
  type FaceEmbedding,
  type Gallery,
  type GalleryPhoto,
  type PhotoMatch,
  type ReferencePhoto,
} from "../photos/types";
import {
  toStaffView,
  type Review,
  type ReviewScores,
  type ReviewSubjectType,
  type ReviewWindow,
  type StaffReviewView,
} from "../reviews/types";
import { aggregate, trend } from "../reviews/aggregate";
import type { ReviewAggregate, TrendPoint } from "../reviews/types";
import { assertUploadAllowed, getStorageProvider } from "../storage";
import { getServiceClient } from "./client";

/**
 * Supabase adapter for the shared novapa-deh project (`public` schema).
 *
 * BUILD STATUS: incremental. Implemented methods talk to Postgres; anything
 * not yet ported throws a loud NotImplemented error via the factory Proxy
 * below — never silent wrong answers. The mock provider remains the
 * default backend (NEXT_PUBLIC_DATA_MODE=mock) until this adapter covers
 * the whole interface and the cutover is rehearsed.
 *
 * Authorization mirrors the mock provider in TypeScript (the test suite's
 * rules), with RLS on every table as defense in depth.
 */

/* ── row → domain mappers ────────────────────────────────────────────── */

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));

function mapUser(row: Row): User {
  return {
    id: String(row.id),
    email: String(row.email),
    displayName: String(row.display_name),
    role: row.role as User["role"],
    familyId: s(row.family_id),
    staffId: s(row.staff_id),
    createdAt: String(row.created_at),
  };
}

function mapFamily(row: Row): Family {
  return {
    id: String(row.id),
    name: String(row.name),
    addressLine1: String(row.address_line1 ?? ""),
    addressLine2: s(row.address_line2),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    preferredContactMethod: (row.preferred_contact_method ??
      "email") as Family["preferredContactMethod"],
    communicationLanguage: String(row.communication_language ?? "en"),
    staffNotes: s(row.staff_notes),
    emergencyContacts: (row.emergency_contacts ?? []) as Family["emergencyContacts"],
    authorizedPickups: (row.authorized_pickups ?? []) as Family["authorizedPickups"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapStudent(row: Row): Student {
  return {
    id: String(row.id),
    familyId: String(row.family_id),
    firstName: String(row.first_name),
    lastName: String(row.last_name),
    preferredName: s(row.preferred_name),
    pronouns: s(row.pronouns),
    dateOfBirth: String(row.date_of_birth),
    grade: String(row.grade ?? ""),
    school: s(row.school),
    tshirtSize: s(row.tshirt_size) as Student["tshirtSize"],
    allergies: s(row.allergies),
    medicalFlags: s(row.medical_flags),
    headshotUrl: s(row.headshot_url),
    headshotPrintUrl: s(row.headshot_print_url),
    resumePdfUrl: s(row.resume_pdf_url),
    resumeCredits: (row.resume_credits ?? []) as Student["resumeCredits"],
    vocalRange: s(row.vocal_range),
    danceExperience: s(row.dance_experience),
    auditionSongUrl: s(row.audition_song_url),
    auditionAudioUrl: s(row.audition_audio_url),
    consents: {
      photoUse: Boolean(row.consent_photo_use),
      faceMatching: Boolean(row.consent_face_matching),
      directoryVisible: Boolean(row.consent_directory_visible),
    },
    hasLogin: Boolean(row.has_login),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapStaff(row: Row): StaffProfile {
  return {
    id: String(row.id),
    userId: s(row.user_id),
    fullName: String(row.full_name),
    title: String(row.title ?? ""),
    bio: String(row.bio ?? ""),
    photoUrl: s(row.photo_url),
    specialties: (row.specialties ?? []) as string[],
    credits: s(row.credits),
    pendingChanges: (row.pending_changes ?? undefined) as StaffProfile["pendingChanges"],
    isPublished: Boolean(row.is_published),
  };
}

function mapNotification(row: Row): AppNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: row.type as AppNotification["type"],
    title: String(row.title),
    body: String(row.body ?? ""),
    url: s(row.url),
    readAt: s(row.read_at),
    createdAt: String(row.created_at),
  };
}

function mapProduction(row: Row): Production {
  return {
    id: String(row.id),
    programId: String(row.program_id),
    seasonId: String(row.season_id),
    title: String(row.title),
    venue: String(row.venue ?? ""),
    directorStaffId: s(row.director_staff_id),
    opensOn: s(row.opens_on),
    closesOn: s(row.closes_on),
    buttonTemplateUrl: s(row.button_template_url),
    ticketsUrl: s(row.tickets_url),
    curriculumUrl: s(row.curriculum_url),
  } as Production;
}

/* ── the adapter ─────────────────────────────────────────────────────── */

class SupabaseDataProvider {
  private get db(): SupabaseClient {
    return getServiceClient();
  }

  /** Load + assert the acting user, mirroring the mock's getActor(). */
  private async actor(actorId: string): Promise<User> {
    const { data, error } = await this.db
      .from("profiles")
      .select("*")
      .eq("id", actorId)
      .maybeSingle();
    if (error) throw new Error(`profiles lookup failed: ${error.message}`);
    if (!data) throw new AccessDeniedError("Unknown user");
    return mapUser(data);
  }

  private isStaffish(user: User): boolean {
    return user.role === "staff" || user.role === "admin" || user.role === "super_admin";
  }

  private assertFamilyAccess(user: User, familyId: string): void {
    if (this.isStaffish(user)) return;
    if (user.familyId !== familyId) {
      throw new AccessDeniedError("Not your family");
    }
  }

  /* ── core slice: identity, family, students, staff, notifications ──── */

  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.db
      .from("profiles")
      .select("*")
      .ilike("email", email)
      .maybeSingle();
    if (error) throw new Error(`profiles lookup failed: ${error.message}`);
    return data ? mapUser(data) : null;
  }

  async getFamily(actorId: string, familyId: string): Promise<Family | null> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data, error } = await this.db
      .from("families")
      .select("*")
      .eq("id", familyId)
      .maybeSingle();
    if (error) throw new Error(`families lookup failed: ${error.message}`);
    if (!data) return null;
    const family = mapFamily(data);
    // staff_notes never leaves the server for a parent session.
    if (!this.isStaffish(actor)) delete family.staffNotes;
    return family;
  }

  async getStudentsForFamily(actorId: string, familyId: string): Promise<Student[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data, error } = await this.db
      .from("students")
      .select("*")
      .eq("family_id", familyId)
      .order("date_of_birth");
    if (error) throw new Error(`students lookup failed: ${error.message}`);
    return (data ?? []).map(mapStudent);
  }

  async getStaffProfiles(): Promise<StaffProfile[]> {
    const { data, error } = await this.db
      .from("staff_profiles")
      .select("*")
      .eq("is_published", true)
      .order("full_name");
    if (error) throw new Error(`staff lookup failed: ${error.message}`);
    return (data ?? []).map(mapStaff);
  }

  async getProduction(productionId: string): Promise<Production | null> {
    const { data, error } = await this.db
      .from("productions")
      .select("*")
      .eq("id", productionId)
      .maybeSingle();
    if (error) throw new Error(`productions lookup failed: ${error.message}`);
    return data ? mapProduction(data) : null;
  }

  async getNotifications(actorId: string): Promise<AppNotification[]> {
    await this.actor(actorId);
    const { data, error } = await this.db
      .from("notifications")
      .select("*")
      .eq("user_id", actorId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`notifications lookup failed: ${error.message}`);
    return (data ?? []).map(mapNotification);
  }

  async markNotificationRead(actorId: string, notificationId: string): Promise<void> {
    // Own-row constraint enforced by the filter — a mismatched id is a no-op.
    const { error } = await this.db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("user_id", actorId);
    if (error) throw new Error(`notification update failed: ${error.message}`);
  }

  async getUnreadNotificationCount(actorId: string): Promise<number> {
    await this.actor(actorId);
    const { count } = await this.db
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", actorId)
      .is("read_at", null);
    return count ?? 0;
  }

  async markAllNotificationsRead(actorId: string): Promise<void> {
    const { error } = await this.db
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", actorId)
      .is("read_at", null);
    if (error) throw new Error(`mark all read failed: ${error.message}`);
  }

  async getNotificationPrefs(actorId: string): Promise<NotificationPrefs> {
    await this.actor(actorId);
    const { data } = await this.db
      .from("notification_prefs").select("*").eq("user_id", actorId).maybeSingle();
    return {
      userId: actorId,
      enabled: (data?.enabled ?? {}) as NotificationPrefs["enabled"],
      quietHoursStart: data?.quiet_hours_start
        ? String(data.quiet_hours_start).slice(0, 5)
        : undefined,
      quietHoursEnd: data?.quiet_hours_end
        ? String(data.quiet_hours_end).slice(0, 5)
        : undefined,
    };
  }

  /* ── family calendar (ported from the mock, same rules) ────────────── */

  private mapEvent(row: Row): CalendarEvent {
    return {
      id: String(row.id),
      type: row.type as CalendarEvent["type"],
      title: String(row.title),
      startsAt: String(row.starts_at),
      endsAt: String(row.ends_at),
      callTime: s(row.call_time),
      location: String(row.location ?? ""),
      mapUrl: s(row.map_url),
      whatToBring: s(row.what_to_bring),
      contactName: s(row.contact_name),
      classId: s(row.class_id),
      productionId: s(row.production_id),
      sceneIds: (row.scene_ids ?? undefined) as string[] | undefined,
      calledNote: s(row.called_note),
      worksNote: s(row.works_note),
      changedAt: s(row.changed_at),
      changeNote: s(row.change_note),
    };
  }

  async getFamilyCalendar(actorId: string, familyId: string): Promise<FamilyCalendarEvent[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const db = this.db;

    const students = await this.getStudentsForFamily(actorId, familyId);
    const studentIds = students.map((st) => st.id);
    if (studentIds.length === 0) return [];

    const [{ data: enr }, { data: cast }] = await Promise.all([
      db.from("enrollments").select("*").in("student_id", studentIds).eq("status", "enrolled"),
      db.from("casting_assignments").select("*").in("student_id", studentIds).not("published_at", "is", null),
    ]);
    const classIds = [...new Set((enr ?? []).map((e) => e.class_id).filter(Boolean))];
    const productionIds = [...new Set((enr ?? []).map((e) => e.production_id).filter(Boolean))];

    let events: Row[] = [];
    if (classIds.length || productionIds.length) {
      const ors = [
        classIds.length ? `class_id.in.(${classIds.join(",")})` : null,
        productionIds.length ? `production_id.in.(${productionIds.join(",")})` : null,
      ].filter(Boolean).join(",");
      const { data, error } = await db.from("calendar_events").select("*").or(ors);
      if (error) throw new Error(`calendar lookup failed: ${error.message}`);
      events = data ?? [];
    }

    // Role/scene data for scene-tagged rehearsals.
    const [{ data: roles }, { data: scenes }] = await Promise.all([
      productionIds.length
        ? db.from("show_roles").select("*").in("production_id", productionIds)
        : Promise.resolve({ data: [] as Row[] }),
      productionIds.length
        ? db.from("show_scenes").select("*").in("production_id", productionIds)
        : Promise.resolve({ data: [] as Row[] }),
    ]);

    const heldRoleIds = (studentId: string, productionId: string): Set<string> => {
      const held = new Set<string>();
      for (const a of cast ?? []) {
        if (a.student_id !== studentId || a.production_id !== productionId) continue;
        for (const r of roles ?? []) {
          if (r.production_id !== productionId) continue;
          if (a.character_name === r.name) held.add(String(r.id));
          else if (a.is_understudy && a.character_name === `${r.name} (Understudy)`) held.add(String(r.id));
        }
      }
      return held;
    };

    const byEvent = new Map<string, FamilyCalendarEvent>();
    for (const student of students) {
      const myClassIds = new Set((enr ?? []).filter((e) => e.student_id === student.id).map((e) => e.class_id));
      const myProdIds = new Set((enr ?? []).filter((e) => e.student_id === student.id).map((e) => e.production_id));
      for (const row of events) {
        const enrolled =
          (row.class_id && myClassIds.has(row.class_id)) ||
          (row.production_id && myProdIds.has(row.production_id));
        if (!enrolled) continue;
        const sceneIds = (row.scene_ids ?? null) as string[] | null;
        if (sceneIds?.length && row.production_id) {
          const held = heldRoleIds(student.id, String(row.production_id));
          // Pre-publication: keep visible rather than hide the schedule.
          if (held.size > 0) {
            const called = (scenes ?? []).some(
              (sc) =>
                sceneIds.includes(String(sc.id)) &&
                ((sc.role_ids ?? []) as string[]).some((rid) => held.has(rid))
            );
            if (!called) continue;
          }
        }
        const existing = byEvent.get(String(row.id));
        if (existing) existing.studentIds.push(student.id);
        else byEvent.set(String(row.id), { ...this.mapEvent(row), studentIds: [student.id] });
      }
    }

    // Approved pickups.
    const { data: pickups } = await db
      .from("pickup_requests").select("*").eq("family_id", familyId).eq("status", "approved");
    for (const rq of pickups ?? []) {
      const id = `pickup-${rq.id}`;
      byEvent.set(id, {
        id, type: "other",
        title:
          rq.kind === "late_dropoff" ? `Late drop-off approved (${rq.drop_off_time})`
          : rq.kind === "early_pickup" ? `Early pickup approved (${rq.pick_up_time})`
          : "Extended care approved",
        startsAt: `${rq.start_date}T12:00:00.000Z`,
        endsAt: `${rq.end_date}T12:30:00.000Z`,
        location: "Studio front desk",
        studentIds: [String(rq.student_id)],
      });
    }

    // Weekly lessons as upcoming occurrences.
    const [{ data: bookings }, { data: slots }, { data: staff }] = await Promise.all([
      db.from("lesson_bookings").select("*").eq("family_id", familyId).eq("status", "active"),
      db.from("lesson_slots").select("*"),
      db.from("staff_profiles").select("id, full_name"),
    ]);
    for (const b of bookings ?? []) {
      const slot = (slots ?? []).find((sl) => sl.id === b.slot_id);
      if (!slot) continue;
      const teacher = (staff ?? []).find((t) => t.id === slot.teacher_staff_id);
      const label = LESSON_DISCIPLINES.find((d) => d.value === slot.discipline)?.label ?? "Private";
      const slotShape = { weekday: Number(slot.weekday), startTime: String(slot.start_time).slice(0, 5) };
      for (const startMs of upcomingLessonOccurrences(slotShape, Date.now(), LESSON_CALENDAR_WEEKS)) {
        const startsAt = new Date(startMs).toISOString();
        const id = `lesson-${b.id}-${startsAt.slice(0, 10)}`;
        byEvent.set(id, {
          id, type: "class",
          title: `${label} lesson — ${teacher?.full_name ?? "NOVA PA"}`,
          startsAt,
          endsAt: new Date(startMs + Number(slot.duration_min) * 60_000).toISOString(),
          location: String(slot.location ?? ""),
          contactName: teacher?.full_name ? String(teacher.full_name) : undefined,
          studentIds: [String(b.student_id)],
        });
      }
    }

    const all = [...byEvent.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    // Sibling conflict detection — same rule as the mock.
    for (const a of all) {
      for (const b of all) {
        if (a.id >= b.id) continue;
        const overlap = a.startsAt < b.endsAt && b.startsAt < a.endsAt;
        const differentKids = a.studentIds.some((x) => !b.studentIds.includes(x)) ||
          b.studentIds.some((x) => !a.studentIds.includes(x));
        if (overlap && differentKids) {
          (a.conflictsWith ??= []).push(b.id);
          (b.conflictsWith ??= []).push(a.id);
        }
      }
    }
    return all;
  }

  async getAllEvents(actorId: string): Promise<CalendarEvent[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data, error } = await this.db
      .from("calendar_events").select("*").order("starts_at");
    if (error) throw new Error(`calendar lookup failed: ${error.message}`);
    return (data ?? []).map((row) => this.mapEvent(row));
  }

  async getProductionCalendar(
    actorId: string,
    productionId: string
  ): Promise<CalendarEvent[]> {
    await this.actor(actorId);
    const { data, error } = await this.db
      .from("calendar_events")
      .select("*")
      .eq("production_id", productionId)
      .order("starts_at");
    if (error) throw new Error(`calendar lookup failed: ${error.message}`);
    return (data ?? []).map((row) => this.mapEvent(row));
  }

  /* ── casting: family-facing slice (ported from the mock) ───────────── */

  private mapRole(row: Row): ShowRole {
    return {
      id: String(row.id),
      productionId: String(row.production_id),
      name: String(row.name),
      tier: row.tier as ShowRole["tier"],
      description: String(row.description ?? ""),
      capacity: row.capacity == null ? null : Number(row.capacity),
      sortOrder: Number(row.sort_order ?? 0),
    };
  }

  private mapConfirmation(row: Row): CastingConfirmation {
    return {
      id: String(row.id),
      assignmentId: String(row.assignment_id),
      studentId: String(row.student_id),
      familyId: String(row.family_id),
      nameCorrect: row.name_correct == null ? undefined : Boolean(row.name_correct),
      playbillName: s(row.playbill_name),
      respondedAt: s(row.responded_at),
      feedbackRequestedAt: s(row.feedback_requested_at),
      lastRemindedAt: s(row.last_reminded_at),
      reminderCount: Number(row.reminder_count ?? 0),
    };
  }

  async getShowRoles(productionId: string): Promise<ShowRole[]> {
    const { data, error } = await this.db
      .from("show_roles").select("*").eq("production_id", productionId)
      .order("sort_order");
    if (error) throw new Error(`show_roles lookup failed: ${error.message}`);
    return (data ?? []).map((row) => this.mapRole(row));
  }

  async getShowScenes(productionId: string): Promise<ShowScene[]> {
    const { data, error } = await this.db
      .from("show_scenes").select("*").eq("production_id", productionId)
      .order("sort_order");
    if (error) throw new Error(`show_scenes lookup failed: ${error.message}`);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      productionId: String(row.production_id),
      name: String(row.name),
      kind: row.kind as ShowScene["kind"],
      roleIds: ((row.role_ids ?? []) as string[]).map(String),
      sortOrder: Number(row.sort_order ?? 0),
    }));
  }

  async getStudentSceneBreakdown(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<Array<{ scene: ShowScene; roleName: string; isUnderstudy: boolean }>> {
    const actor = await this.actor(actorId);
    const { data: student } = await this.db
      .from("students").select("id, family_id").eq("id", studentId).maybeSingle();
    if (!student) throw new Error("Student not found");
    if (!this.isStaffish(actor)) {
      this.assertFamilyAccess(actor, String(student.family_id));
    }

    const [roles, scenes, { data: cast }] = await Promise.all([
      this.getShowRoles(productionId),
      this.getShowScenes(productionId),
      this.db.from("casting_assignments").select("*")
        .eq("student_id", studentId).eq("production_id", productionId)
        .not("published_at", "is", null),
    ]);

    const principal: string[] = [];
    const understudy: string[] = [];
    for (const a of cast ?? []) {
      for (const role of roles) {
        if (a.character_name === role.name) principal.push(role.id);
        else if (a.is_understudy && a.character_name === `${role.name} (Understudy)`)
          understudy.push(role.id);
      }
    }
    if (principal.length === 0 && understudy.length === 0) return [];
    const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? "";

    const rows: Array<{ scene: ShowScene; roleName: string; isUnderstudy: boolean }> = [];
    for (const scene of scenes) {
      const asPrincipal = principal.find((id) => scene.roleIds.includes(id));
      if (asPrincipal) {
        rows.push({ scene, roleName: roleName(asPrincipal), isUnderstudy: false });
        continue;
      }
      const asUnderstudy = understudy.find((id) => scene.roleIds.includes(id));
      if (asUnderstudy) {
        rows.push({
          scene,
          roleName: `${roleName(asUnderstudy)} (Understudy)`,
          isUnderstudy: true,
        });
      }
    }
    return rows;
  }

  async getMyCastingConfirmations(actorId: string): Promise<
    Array<{
      confirmation: CastingConfirmation;
      roleName: string;
      productionTitle: string;
      studentName: string;
    }>
  > {
    const actor = await this.actor(actorId);
    if (!actor.familyId) return [];

    const { data: confirmations, error } = await this.db
      .from("casting_confirmations").select("*").eq("family_id", actor.familyId);
    if (error) throw new Error(`confirmations lookup failed: ${error.message}`);
    if (!confirmations?.length) return [];

    const assignmentIds = confirmations.map((c) => c.assignment_id);
    const studentIds = confirmations.map((c) => c.student_id);
    const [{ data: assignments }, { data: students }, { data: productions }] =
      await Promise.all([
        this.db.from("casting_assignments").select("*").in("id", assignmentIds),
        this.db.from("students").select("*").in("id", studentIds),
        this.db.from("productions").select("id, title"),
      ]);

    return confirmations.map((row) => {
      const assignment = (assignments ?? []).find((a) => a.id === row.assignment_id);
      const production = (productions ?? []).find(
        (p) => p.id === assignment?.production_id
      );
      const student = (students ?? []).find((st) => st.id === row.student_id);
      return {
        confirmation: this.mapConfirmation(row),
        roleName: String(assignment?.character_name ?? ""),
        productionTitle: String(production?.title ?? ""),
        studentName: student
          ? `${student.preferred_name ?? student.first_name} ${student.last_name}`
          : "",
      };
    });
  }

  async respondToCasting(
    actorId: string,
    confirmationId: string,
    response: { nameCorrect: boolean; playbillName?: string }
  ): Promise<CastingConfirmation> {
    const actor = await this.actor(actorId);
    const { data: row } = await this.db
      .from("casting_confirmations").select("*").eq("id", confirmationId).maybeSingle();
    if (!row) throw new Error("Confirmation not found");
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, String(row.family_id));

    const patch: Record<string, unknown> = {
      name_correct: response.nameCorrect,
      responded_at: new Date().toISOString(),
    };
    if (!response.nameCorrect) {
      const corrected = response.playbillName?.trim();
      if (!corrected) {
        throw new Error("Tell us exactly what the playbill should print");
      }
      patch.playbill_name = corrected;
    } else {
      patch.playbill_name = null;
    }

    const { data: updated, error } = await this.db
      .from("casting_confirmations").update(patch).eq("id", confirmationId)
      .select().single();
    if (error) throw new Error(`confirmation update failed: ${error.message}`);

    // Tell admins a playbill correction arrived (same rule as the mock).
    if (!response.nameCorrect) {
      const [{ data: student }, { data: admins }] = await Promise.all([
        this.db.from("students").select("first_name").eq("id", row.student_id).maybeSingle(),
        this.db.from("profiles").select("id").in("role", ["admin", "super_admin"]),
      ]);
      const notifications = (admins ?? []).map((admin) => ({
        user_id: admin.id,
        type: "broadcast",
        title: "Playbill name correction",
        body: `${student?.first_name ?? "A student"} → "${patch.playbill_name}"`,
        url: "/admin/casting-responses",
      }));
      if (notifications.length) {
        await this.db.from("notifications").insert(notifications);
      }
    }
    return this.mapConfirmation(updated);
  }

  /* ── staff casting board (ported from the mock) ────────────────────── */

  private mapBoard(row: Row | null, productionId: string): CastingBoard {
    if (!row) {
      return { productionId, status: "drafting", entries: [], understudyEntries: [] };
    }
    return {
      productionId,
      // DB stores 'draft' (migration 0009); the app type says 'drafting'.
      status: row.status === "submitted" ? "submitted" : "drafting",
      entries: (row.entries ?? []) as CastingBoard["entries"],
      understudyEntries: (row.understudy_entries ?? []) as CastingBoard["entries"],
      submittedAt: s(row.submitted_at),
      understudiesPublishedAt: s(row.understudies_published_at),
    };
  }

  private async boardFor(productionId: string): Promise<CastingBoard> {
    const { data, error } = await this.db
      .from("casting_boards").select("*").eq("production_id", productionId).maybeSingle();
    if (error) throw new Error(`casting board lookup failed: ${error.message}`);
    return this.mapBoard(data, productionId);
  }

  private async saveBoard(board: CastingBoard): Promise<void> {
    const { error } = await this.db.from("casting_boards").upsert({
      production_id: board.productionId,
      status: board.status === "submitted" ? "submitted" : "draft",
      entries: board.entries,
      understudy_entries: board.understudyEntries,
      submitted_at: board.submittedAt ?? null,
      understudies_published_at: board.understudiesPublishedAt ?? null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(`casting board save failed: ${error.message}`);
  }

  private async registeredStudents(productionId: string): Promise<Student[]> {
    const { data: enr } = await this.db
      .from("enrollments").select("student_id")
      .eq("production_id", productionId).eq("status", "enrolled");
    const ids = [...new Set((enr ?? []).map((e) => e.student_id))];
    if (ids.length === 0) return [];
    const { data } = await this.db.from("students").select("*").in("id", ids);
    return (data ?? []).map(mapStudent);
  }

  async getCastingBoard(
    actorId: string,
    productionId: string
  ): Promise<{
    board: CastingBoard;
    roles: ShowRole[];
    unassigned: Student[];
    studentsById: Record<string, Student>;
  }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const [board, roles, registered] = await Promise.all([
      this.boardFor(productionId),
      this.getShowRoles(productionId),
      this.registeredStudents(productionId),
    ]);
    const assignedIds = new Set(board.entries.map((entry) => entry.studentId));
    return {
      board,
      roles,
      unassigned: registered.filter((st) => !assignedIds.has(st.id)),
      studentsById: Object.fromEntries(registered.map((st) => [st.id, st])),
    };
  }

  async assignRole(
    actorId: string,
    productionId: string,
    roleId: string,
    studentId: string
  ): Promise<void> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = await this.boardFor(productionId);
    if (board.status === "submitted") {
      throw new Error("Casting has already been submitted");
    }
    const roles = await this.getShowRoles(productionId);
    const role = roles.find((r) => r.id === roleId);
    if (!role) throw new Error("Role not found");
    const registered = await this.registeredStudents(productionId);
    if (!registered.some((st) => st.id === studentId)) {
      throw new Error("That student isn't registered for this production");
    }

    // A student holds exactly one role: placing them moves them.
    board.entries = board.entries.filter((entry) => entry.studentId !== studentId);

    // Named roles hold one student; assigning over a full role replaces the
    // occupant (they return to Unassigned) rather than silently double-casting.
    if (role.capacity !== null) {
      const occupants = board.entries.filter((entry) => entry.roleId === roleId);
      if (occupants.length >= role.capacity) {
        board.entries = board.entries.filter((entry) => entry.roleId !== roleId);
      }
    }

    board.entries.push({ roleId, studentId });
    await this.saveBoard(board);
  }

  async unassignRole(actorId: string, productionId: string, studentId: string): Promise<void> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = await this.boardFor(productionId);
    if (board.status === "submitted") {
      throw new Error("Casting has already been submitted");
    }
    board.entries = board.entries.filter((entry) => entry.studentId !== studentId);
    await this.saveBoard(board);
  }

  async submitCasting(
    actorId: string,
    productionId: string
  ): Promise<{ assignmentsCreated: number; familiesNotified: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = await this.boardFor(productionId);
    if (board.status === "submitted") {
      throw new Error("Casting has already been submitted");
    }

    // The hard rule: every registered student has a role. No one forgotten.
    const registered = await this.registeredStudents(productionId);
    const assignedIds = new Set(board.entries.map((entry) => entry.studentId));
    const missing = registered.filter((st) => !assignedIds.has(st.id));
    if (missing.length > 0) {
      throw new Error(
        `Every student must have a role before submitting. Still unassigned: ${missing
          .map((st) => `${st.preferredName ?? st.firstName} ${st.lastName}`)
          .join(", ")}`
      );
    }

    const [roles, { data: production }, { data: parents }] = await Promise.all([
      this.getShowRoles(productionId),
      this.db.from("productions").select("title").eq("id", productionId).maybeSingle(),
      this.db.from("profiles").select("id, family_id").eq("role", "parent"),
    ]);
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const studentsById = new Map(registered.map((st) => [st.id, st]));

    let assignmentsCreated = 0;
    const notifiedFamilies = new Set<string>();
    const now = new Date().toISOString();

    for (const entry of board.entries) {
      const role = rolesById.get(entry.roleId);
      const student = studentsById.get(entry.studentId);
      if (!role || !student) continue;

      // Published assignment. The DB trigger writes show_history for us.
      const { data: assignment, error } = await this.db
        .from("casting_assignments")
        .insert({
          production_id: productionId,
          student_id: student.id,
          character_name: role.name,
          cast_group: role.tier === "ensemble" ? role.name : null,
          is_understudy: false,
          published_at: now,
        })
        .select().single();
      if (error) throw new Error(`assignment insert failed: ${error.message}`);
      assignmentsCreated += 1;

      // The confirmation the family responds to; first 12h reminder counts
      // from submission.
      const { error: confErr } = await this.db.from("casting_confirmations").insert({
        assignment_id: assignment.id,
        student_id: student.id,
        family_id: student.familyId,
        last_reminded_at: now,
        reminder_count: 0,
      });
      if (confErr) throw new Error(`confirmation insert failed: ${confErr.message}`);

      // Notify THIS family about THIS child only — never a cast list.
      const familyParents = (parents ?? []).filter(
        (parent) => parent.family_id === student.familyId
      );
      if (familyParents.length) {
        await this.db.from("notifications").insert(
          familyParents.map((parent) => ({
            user_id: parent.id,
            type: "casting_released",
            title: `Casting for ${production?.title ?? "the show"} 🎉`,
            body: `${student.preferredName ?? student.firstName} will be: ${role.name}. Tap to confirm the name for the playbill.`,
            url: "/casting",
          }))
        );
        notifiedFamilies.add(student.familyId);
      }
    }

    board.status = "submitted";
    board.submittedAt = now;
    await this.saveBoard(board);
    return { assignmentsCreated, familiesNotified: notifiedFamilies.size };
  }

  /* ── audition profiles & rubric evaluations (ported from the mock) ─── */

  private mapAuditionProfile(row: Row): AuditionProfile {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      productionId: String(row.production_id),
      preferenceTier: row.preference_tier as RoleTier,
      previousRoles: String(row.previous_roles ?? ""),
      hopes: String(row.hopes ?? ""),
      acknowledgedNoGuaranteeAt: String(row.acknowledged_at ?? row.created_at),
      submittedByUserId: String(row.submitted_by_user_id ?? ""),
      submittedByRole: (row.submitted_by_role ?? "parent") as "parent" | "student",
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapEvaluation(row: Row): AuditionEvaluation {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      productionId: String(row.production_id),
      discipline: row.discipline as Discipline,
      // DB stores the evaluator's profile id; the app only renders the name.
      evaluatorStaffId: String(row.evaluator_user_id ?? ""),
      evaluatorName: String(row.evaluator_name ?? ""),
      scores: (row.scores ?? {}) as Record<string, number>,
      notes: String(row.notes ?? ""),
      callbackNotes: String(row.callback_notes ?? ""),
      growthNotes: s(row.growth_notes),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async submitAuditionProfile(
    actorId: string,
    input: {
      studentId: string;
      productionId: string;
      preferenceTier: RoleTier;
      previousRoles: string;
      hopes: string;
      acknowledgedNoGuarantee: boolean;
    }
  ): Promise<AuditionProfile> {
    const actor = await this.actor(actorId);
    const { data: student } = await this.db
      .from("students").select("id, family_id, has_login")
      .eq("id", input.studentId).maybeSingle();
    if (!student) throw new Error("Student not found");

    // A parent of this child, or the student themself (13+ login). Staff
    // never write audition profiles.
    const isOwnParent =
      actor.role === "parent" && actor.familyId === String(student.family_id);
    const isSelf =
      actor.role === "student" &&
      actor.familyId === String(student.family_id) &&
      Boolean(student.has_login);
    if (!isOwnParent && !isSelf) {
      throw new AccessDeniedError(
        "Only this student's family can submit their audition profile"
      );
    }
    if (!input.acknowledgedNoGuarantee) {
      throw new Error(
        "Please confirm you understand that a preference doesn't guarantee a specific part"
      );
    }
    const registered = await this.registeredStudents(input.productionId);
    if (!registered.some((st) => st.id === input.studentId)) {
      throw new Error("This student isn't registered for that production");
    }

    const { data, error } = await this.db
      .from("audition_profiles")
      .upsert(
        {
          student_id: input.studentId,
          production_id: input.productionId,
          preference_tier: input.preferenceTier,
          previous_roles: input.previousRoles,
          hopes: input.hopes,
          acknowledged_no_guarantee: true,
          acknowledged_at: new Date().toISOString(),
          submitted_by_user_id: actor.id,
          submitted_by_role: actor.role === "student" ? "student" : "parent",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,production_id" }
      )
      .select().single();
    if (error) throw new Error(`audition profile save failed: ${error.message}`);
    return this.mapAuditionProfile(data);
  }

  async getAuditionProfile(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<AuditionProfile | null> {
    const actor = await this.actor(actorId);
    const { data: student } = await this.db
      .from("students").select("family_id").eq("id", studentId).maybeSingle();
    if (!student) return null;
    if (!this.isStaffish(actor)) {
      this.assertFamilyAccess(actor, String(student.family_id));
    }
    const { data } = await this.db
      .from("audition_profiles").select("*")
      .eq("student_id", studentId).eq("production_id", productionId).maybeSingle();
    return data ? this.mapAuditionProfile(data) : null;
  }

  async getAuditionRoster(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{
      student: Student;
      profile: AuditionProfile | null;
      evaluations: AuditionEvaluation[];
    }>
  > {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const [registered, { data: profiles }, { data: evaluations }] = await Promise.all([
      this.registeredStudents(productionId),
      this.db.from("audition_profiles").select("*").eq("production_id", productionId),
      this.db.from("audition_evaluations").select("*").eq("production_id", productionId),
    ]);
    return registered.map((student) => ({
      student,
      profile: (() => {
        const row = (profiles ?? []).find((pr) => pr.student_id === student.id);
        return row ? this.mapAuditionProfile(row) : null;
      })(),
      evaluations: (evaluations ?? [])
        .filter((e) => e.student_id === student.id)
        .map((e) => this.mapEvaluation(e)),
    }));
  }

  async submitEvaluation(
    actorId: string,
    input: {
      studentId: string;
      productionId: string;
      discipline: Discipline;
      scores: Record<string, number>;
      notes: string;
      callbackNotes: string;
      growthNotes?: string;
    }
  ): Promise<AuditionEvaluation> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    // Scores must cover exactly this discipline's criteria, each 1–5.
    const criteria = RUBRIC_CRITERIA[input.discipline].map((c) => c.key);
    for (const key of criteria) {
      const value = input.scores[key];
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error(`Score each rubric line 1–5 (missing: ${key})`);
      }
    }

    const { data, error } = await this.db
      .from("audition_evaluations")
      .upsert(
        {
          student_id: input.studentId,
          production_id: input.productionId,
          discipline: input.discipline,
          evaluator_user_id: actor.id,
          evaluator_name: actor.displayName,
          scores: input.scores,
          notes: input.notes,
          callback_notes: input.callbackNotes,
          growth_notes: input.growthNotes ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,production_id,discipline" }
      )
      .select().single();
    if (error) throw new Error(`evaluation save failed: ${error.message}`);
    return this.mapEvaluation(data);
  }

  async requestAuditionFeedback(
    actorId: string,
    confirmationId: string
  ): Promise<AuditionEvaluation[]> {
    const actor = await this.actor(actorId);
    const { data: confirmation } = await this.db
      .from("casting_confirmations").select("*").eq("id", confirmationId).maybeSingle();
    if (!confirmation) throw new Error("Confirmation not found");
    if (!this.isStaffish(actor)) {
      this.assertFamilyAccess(actor, String(confirmation.family_id));
    }

    if (!confirmation.feedback_requested_at) {
      await this.db
        .from("casting_confirmations")
        .update({ feedback_requested_at: new Date().toISOString() })
        .eq("id", confirmationId);
    }
    const { data: assignment } = await this.db
      .from("casting_assignments").select("production_id")
      .eq("id", confirmation.assignment_id).maybeSingle();
    if (!assignment) return [];

    // Release rubrics + evaluator notes for THIS child only.
    // callbackNotes stay staff-internal: strip them from the release.
    const { data: evaluations } = await this.db
      .from("audition_evaluations").select("*")
      .eq("student_id", confirmation.student_id)
      .eq("production_id", assignment.production_id);
    return (evaluations ?? []).map((row) => ({
      ...this.mapEvaluation(row),
      callbackNotes: "",
    }));
  }

  async getGrowthRecommendations(
    actorId: string,
    studentId: string,
    productionId: string
  ): Promise<GrowthRecommendation[]> {
    const actor = await this.actor(actorId);
    const { data: student } = await this.db
      .from("students").select("family_id").eq("id", studentId).maybeSingle();
    if (!student) return [];
    if (!this.isStaffish(actor)) {
      this.assertFamilyAccess(actor, String(student.family_id));
    }

    // Same advisory links as the mock; real catalog ids arrive with the
    // store slice.
    const OFFERINGS: Record<Discipline, { productIds: string[]; classIds: string[] }> = {
      vocal: { productIds: ["prod-voice-lessons"], classIds: ["class-voice1"] },
      dance: { productIds: ["prod-dance-lessons"], classIds: ["class-mtd2"] },
      acting: { productIds: ["prod-acting-lessons"], classIds: [] },
    };
    const LABEL: Record<Discipline, string> = {
      vocal: "singing",
      dance: "dance",
      acting: "acting",
    };

    const { data: evaluations } = await this.db
      .from("audition_evaluations").select("*")
      .eq("student_id", studentId).eq("production_id", productionId);

    const recommendations: GrowthRecommendation[] = [];
    for (const row of evaluations ?? []) {
      const evaluation = this.mapEvaluation(row);
      const values = Object.values(evaluation.scores);
      if (values.length === 0) continue;
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      if (average >= RECOMMENDATION_THRESHOLD) continue;
      recommendations.push({
        discipline: evaluation.discipline,
        averageScore: Math.round(average * 10) / 10,
        ...OFFERINGS[evaluation.discipline],
        message: `Growing ${LABEL[evaluation.discipline]} skills between shows makes the biggest difference at the next audition.`,
      });
    }
    return recommendations;
  }

  /* ── understudies & cast-list status (ported from the mock) ────────── */

  async assignUnderstudy(
    actorId: string,
    productionId: string,
    roleId: string,
    studentId: string
  ): Promise<void> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const board = await this.boardFor(productionId);
    if (board.status !== "submitted") {
      throw new Error("Cast the show first — understudies come after every role is filled");
    }
    if (board.understudiesPublishedAt) {
      throw new Error("Understudies have already been published");
    }

    const roles = await this.getShowRoles(productionId);
    const role = roles.find((r) => r.id === roleId);
    if (!role) throw new Error("Role not found");
    if (role.tier !== "lead") {
      throw new Error("Understudies are cast for lead roles only");
    }
    const registered = await this.registeredStudents(productionId);
    if (!registered.some((st) => st.id === studentId)) {
      throw new Error("That student isn't registered for this production");
    }
    // A student can't understudy the role they already hold — that's not
    // coverage. Any OTHER role they hold is fine; duplication is the point.
    const holdsThisRole = board.entries.some(
      (entry) => entry.roleId === roleId && entry.studentId === studentId
    );
    if (holdsThisRole) {
      throw new Error("They already play this role — pick a different understudy");
    }

    // One understudy per lead, one lead per understudy: placing moves.
    board.understudyEntries = board.understudyEntries.filter(
      (entry) => entry.studentId !== studentId && entry.roleId !== roleId
    );
    board.understudyEntries.push({ roleId, studentId });
    await this.saveBoard(board);
  }

  async unassignUnderstudy(
    actorId: string,
    productionId: string,
    studentId: string
  ): Promise<void> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = await this.boardFor(productionId);
    if (board.understudiesPublishedAt) {
      throw new Error("Understudies have already been published");
    }
    board.understudyEntries = board.understudyEntries.filter(
      (entry) => entry.studentId !== studentId
    );
    await this.saveBoard(board);
  }

  /** Lead roles with no understudy yet — "where the holes are". */
  async getUnderstudyHoles(actorId: string, productionId: string): Promise<ShowRole[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const [board, roles] = await Promise.all([
      this.boardFor(productionId),
      this.getShowRoles(productionId),
    ]);
    const covered = new Set(board.understudyEntries.map((entry) => entry.roleId));
    return roles.filter((role) => role.tier === "lead" && !covered.has(role.id));
  }

  async publishUnderstudies(
    actorId: string,
    productionId: string
  ): Promise<{ published: number; holes: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const board = await this.boardFor(productionId);
    if (board.status !== "submitted") throw new Error("Cast the show first");
    if (board.understudiesPublishedAt) {
      throw new Error("Understudies have already been published");
    }

    const [roles, registered, { data: production }, { data: parents }] =
      await Promise.all([
        this.getShowRoles(productionId),
        this.registeredStudents(productionId),
        this.db.from("productions").select("title").eq("id", productionId).maybeSingle(),
        this.db.from("profiles").select("id, family_id").eq("role", "parent"),
      ]);
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const studentsById = new Map(registered.map((st) => [st.id, st]));
    const now = new Date().toISOString();
    let published = 0;

    for (const entry of board.understudyEntries) {
      const role = rolesById.get(entry.roleId);
      const student = studentsById.get(entry.studentId);
      if (!role || !student) continue;

      // Published understudy assignment; the DB trigger writes show_history.
      const { data: assignment, error } = await this.db
        .from("casting_assignments")
        .insert({
          production_id: productionId,
          student_id: student.id,
          character_name: `${role.name} (Understudy)`,
          is_understudy: true,
          published_at: now,
        })
        .select().single();
      if (error) throw new Error(`understudy insert failed: ${error.message}`);
      published += 1;

      await this.db.from("casting_confirmations").insert({
        assignment_id: assignment.id,
        student_id: student.id,
        family_id: student.familyId,
        last_reminded_at: now,
        reminder_count: 0,
      });

      const familyParents = (parents ?? []).filter(
        (parent) => parent.family_id === student.familyId
      );
      if (familyParents.length) {
        await this.db.from("notifications").insert(
          familyParents.map((parent) => ({
            user_id: parent.id,
            type: "casting_released",
            title: `Understudy casting for ${production?.title ?? "the show"} ⭐`,
            body: `${student.preferredName ?? student.firstName} will understudy: ${role.name}. Tap to confirm the name for the playbill.`,
            url: "/casting",
          }))
        );
      }
    }

    board.understudiesPublishedAt = now;
    await this.saveBoard(board);
    const holes = (await this.getUnderstudyHoles(actorId, productionId)).length;
    return { published, holes };
  }

  async getCastListStatus(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{
      role: ShowRole;
      status: "open" | "filled" | "accepted";
      holders: Array<{
        studentName: string;
        playbillName: string;
        responded: boolean;
        isUnderstudy: boolean;
      }>;
    }>
  > {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const [roles, { data: assignments }, { data: confirmations }, { data: students }] =
      await Promise.all([
        this.getShowRoles(productionId),
        this.db.from("casting_assignments").select("*")
          .eq("production_id", productionId).not("published_at", "is", null),
        this.db.from("casting_confirmations").select("*"),
        this.db.from("students").select("id, first_name, preferred_name, last_name"),
      ]);

    return roles.map((role) => {
      const holders = (assignments ?? [])
        .filter((a) =>
          a.is_understudy
            ? a.character_name === `${role.name} (Understudy)` ||
              a.character_name === role.name
            : a.character_name === role.name
        )
        .map((a) => {
          const student = (students ?? []).find((st) => st.id === a.student_id);
          const confirmation = (confirmations ?? []).find(
            (c) => c.assignment_id === a.id
          );
          const studentName = student
            ? `${student.preferred_name ?? student.first_name} ${student.last_name}`
            : "Unknown";
          return {
            studentName,
            playbillName: String(confirmation?.playbill_name ?? studentName),
            responded: confirmation?.name_correct != null,
            isUnderstudy: Boolean(a.is_understudy),
          };
        });

      // Understudies don't gate acceptance of the principal role.
      const principals = holders.filter((holder) => !holder.isUnderstudy);
      const status: "open" | "filled" | "accepted" =
        principals.length === 0
          ? "open"
          : principals.every((holder) => holder.responded)
            ? "accepted"
            : "filled";
      return { role, status, holders };
    });
  }

  async getCastingResponses(
    actorId: string,
    productionId: string
  ): Promise<
    Array<{ confirmation: CastingConfirmation; studentName: string; roleName: string }>
  > {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const [{ data: assignments }, { data: confirmations }, { data: students }] =
      await Promise.all([
        this.db.from("casting_assignments").select("id, character_name")
          .eq("production_id", productionId),
        this.db.from("casting_confirmations").select("*"),
        this.db.from("students").select("id, first_name, preferred_name, last_name"),
      ]);
    const assignmentIds = new Set((assignments ?? []).map((a) => a.id));

    return (confirmations ?? [])
      .filter((c) => assignmentIds.has(c.assignment_id))
      .map((c) => {
        const assignment = (assignments ?? []).find((a) => a.id === c.assignment_id);
        const student = (students ?? []).find((st) => st.id === c.student_id);
        return {
          confirmation: this.mapConfirmation(c),
          studentName: student
            ? `${student.preferred_name ?? student.first_name} ${student.last_name}`
            : "",
          roleName: String(assignment?.character_name ?? ""),
        };
      });
  }

  /* ── health forms (ported from the mock) ───────────────────────────── */

  private mapHealthForm(row: Row): HealthForm {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      seasonId: String(row.season_id),
      answers: (row.answers ?? {}) as HealthForm["answers"],
      signedByName: s(row.signed_by_name),
      signedAt: s(row.signed_at),
      signedFromIp: s(row.signed_from_ip),
      expiresOn: String(row.expires_on),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private async studentFamilyOrThrow(studentId: string): Promise<string | null> {
    const { data } = await this.db
      .from("students").select("family_id").eq("id", studentId).maybeSingle();
    return data ? String(data.family_id) : null;
  }

  async getHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string
  ): Promise<HealthForm | null> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return null;
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("health_forms").select("*")
      .eq("student_id", studentId).eq("season_id", seasonId).maybeSingle();
    return data ? this.mapHealthForm(data) : null;
  }

  async getPreviousHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string
  ): Promise<HealthForm | null> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return null;
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("health_forms").select("*")
      .eq("student_id", studentId).neq("season_id", seasonId)
      .not("signed_at", "is", null)
      .order("signed_at", { ascending: false }).limit(1);
    return data?.length ? this.mapHealthForm(data[0]) : null;
  }

  async saveHealthForm(
    actorId: string,
    studentId: string,
    seasonId: string,
    answers: HealthForm["answers"],
    signature?: { name: string; ip: string }
  ): Promise<HealthForm> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) throw new Error("Student not found");
    // Only the family signs health forms — staff attest nothing.
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && !(actor.role === "parent" && actor.familyId === familyId)) {
      throw new AccessDeniedError("Not allowed to modify this family");
    }

    const { data: season } = await this.db
      .from("seasons").select("ends_on").eq("id", seasonId).maybeSingle();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      student_id: studentId,
      season_id: seasonId,
      answers,
      expires_on: season?.ends_on ?? "2027-06-15",
      updated_at: now,
    };
    if (signature) {
      patch.signed_by_name = signature.name;
      patch.signed_at = now;
      patch.signed_from_ip = signature.ip;
    }
    const { data, error } = await this.db
      .from("health_forms")
      .upsert(patch, { onConflict: "student_id,season_id" })
      .select().single();
    if (error) throw new Error(`health form save failed: ${error.message}`);
    return this.mapHealthForm(data);
  }

  async getHealthFormStatus(
    actorId: string,
    scope: { productionId?: string; classId?: string }
  ): Promise<Array<{ student: Student; form: HealthForm | null }>> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data: currentSeason } = await this.db
      .from("seasons").select("id").eq("is_current", true).maybeSingle();

    let query = this.db.from("enrollments").select("student_id").eq("status", "enrolled");
    if (scope.productionId) query = query.eq("production_id", scope.productionId);
    else if (scope.classId) query = query.eq("class_id", scope.classId);
    const { data: enrolled } = await query;
    const studentIds = [...new Set((enrolled ?? []).map((e) => e.student_id))];
    if (studentIds.length === 0) return [];

    const [{ data: students }, { data: forms }] = await Promise.all([
      this.db.from("students").select("*").in("id", studentIds),
      this.db.from("health_forms").select("*")
        .in("student_id", studentIds)
        .eq("season_id", currentSeason?.id ?? "")
        .not("signed_at", "is", null),
    ]);
    return (students ?? []).map((row) => {
      const student = mapStudent(row);
      const form = (forms ?? []).find((f) => f.student_id === student.id);
      return { student, form: form ? this.mapHealthForm(form) : null };
    });
  }

  /* ── registration sync & FSA (ported) ──────────────────────────────── */

  private mapAccountLink(row: Row): AccountLink {
    return {
      familyId: String(row.family_id),
      source: row.source as RegistrationSource,
      externalId: String(row.external_id),
      externalEmail: String(row.external_email),
      linkedAt: String(row.linked_at),
      autoMatched: Boolean(row.auto_matched),
    };
  }

  private mapSyncRun(row: Row): SyncRun {
    return {
      id: String(row.id),
      source: row.source as RegistrationSource,
      startedAt: String(row.started_at),
      finishedAt: s(row.finished_at),
      status: row.status as SyncRun["status"],
      trigger: row.trigger as SyncRun["trigger"],
      counts: (row.counts ?? {}) as SyncRun["counts"],
      issues: (row.issues ?? []) as SyncRun["issues"],
      error: s(row.error),
    };
  }

  async syncRegistration(
    actorId: string,
    snapshot: RegistrationSnapshot,
    trigger: SyncRun["trigger"]
  ): Promise<SyncRun> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const startedAt = new Date().toISOString();

    const [{ data: familiesRows }, { data: guardiansRows }, { data: studentsRows },
      { data: enrollmentsRows }, productions, classes, { data: linksRows },
      coachingActivityIds] =
      await Promise.all([
        this.db.from("families").select("*"),
        this.db.from("guardians").select("*"),
        this.db.from("students").select("*"),
        this.db.from("enrollments").select("*"),
        this.getProductions(),
        this.getClasses(),
        this.db.from("registration_account_links").select("*"),
        // Coaching is the staff portal's; this is the only thing that lets a
        // coaching purchase resolve. Failing soft to an empty set degrades to
        // the old behaviour rather than taking the whole sync down.
        fetchCoachingActivityIds(),
      ]);

    // The reconcile plan is pure and identical to the mock's.
    const plan = reconcile({
      snapshot,
      families: (familiesRows ?? []).map(mapFamily),
      guardians: (guardiansRows ?? []).map((g) => this.mapGuardian(g)),
      students: (studentsRows ?? []).map(mapStudent),
      enrollments: (enrollmentsRows ?? []).map((e) => this.mapEnrollment(e)),
      productions,
      classes,
      links: (linksRows ?? []).map((l) => this.mapAccountLink(l)),
      coachingActivityIds,
    });

    for (const link of plan.autoLinks) {
      await this.db.from("registration_account_links").upsert(
        {
          family_id: link.familyId, source: link.source,
          external_id: link.externalId, external_email: link.externalEmail,
          auto_matched: true,
        },
        { onConflict: "family_id,source", ignoreDuplicates: true }
      );
    }
    for (const create of plan.creates) {
      await this.db.from("enrollments").insert({
        student_id: create.studentId,
        class_id: create.classId ?? null,
        production_id: create.productionId ?? null,
        coaching_activity_id: create.coachingActivityId ?? null,
        status: create.status,
        balance_cents: create.balanceCents,
        source: "registration_portal",
        external_id: create.externalId,
        external_source: snapshot.source,
        offering_category: create.offeringCategory ?? null,
        amount_paid_cents: create.amountPaidCents ?? null,
        session_starts_on: create.sessionStartsOn ?? null,
        session_ends_on: create.sessionEndsOn ?? null,
      });
    }
    for (const update of plan.updates) {
      const patch: Record<string, unknown> = {};
      if (update.balanceCents !== undefined) patch.balance_cents = update.balanceCents;
      if (update.status !== undefined) patch.status = update.status;
      if (update.amountPaidCents !== undefined) {
        patch.amount_paid_cents = update.amountPaidCents;
      }
      if (update.offeringCategory !== undefined) {
        patch.offering_category = update.offeringCategory;
      }
      if (update.sessionStartsOn !== undefined) {
        patch.session_starts_on = update.sessionStartsOn;
        patch.session_ends_on = update.sessionEndsOn ?? null;
      }
      if (Object.keys(patch).length) {
        await this.db.from("enrollments").update(patch).eq("id", update.enrollmentId);
      }
    }

    const { data: run, error } = await this.db
      .from("registration_sync_runs")
      .insert({
        source: snapshot.source, trigger,
        status: plan.issues.length > 0 ? "partial" : "success",
        started_at: startedAt, finished_at: new Date().toISOString(),
        counts: plan.counts, issues: plan.issues,
      })
      .select().single();
    if (error) throw new Error(`sync run failed: ${error.message}`);

    // Notify families whose balance changed, so a new charge isn't silent.
    for (const update of plan.updates) {
      if (update.balanceCents === undefined || update.balanceCents <= 0) continue;
      const { data: enrollment } = await this.db
        .from("enrollments").select("student_id").eq("id", update.enrollmentId).maybeSingle();
      if (!enrollment) continue;
      const { data: student } = await this.db
        .from("students").select("family_id, first_name, preferred_name")
        .eq("id", enrollment.student_id).maybeSingle();
      if (!student) continue;
      const { data: parents } = await this.db
        .from("profiles").select("id")
        .eq("family_id", student.family_id).eq("role", "parent");
      if (parents?.length) {
        await this.db.from("notifications").insert(
          parents.map((parent) => ({
            user_id: parent.id, type: "payment_due", title: "Balance updated",
            body: `${student.preferred_name ?? student.first_name} has an outstanding balance.`,
            url: "/dashboard",
          }))
        );
      }
    }
    return this.mapSyncRun(run);
  }

  async recordSyncFailure(
    actorId: string,
    source: RegistrationSource,
    trigger: SyncRun["trigger"],
    error: string
  ): Promise<SyncRun> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const now = new Date().toISOString();
    const { data, error: dbErr } = await this.db
      .from("registration_sync_runs")
      .insert({
        source, trigger, status: "failed", started_at: now, finished_at: now,
        counts: {
          accountsSeen: 0, enrollmentsSeen: 0, enrollmentsCreated: 0,
          enrollmentsUpdated: 0, balancesUpdated: 0,
        },
        issues: [], error,
      })
      .select().single();
    if (dbErr) throw new Error(`sync failure record failed: ${dbErr.message}`);
    return this.mapSyncRun(data);
  }

  async getSyncRuns(actorId: string): Promise<SyncRun[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db
      .from("registration_sync_runs").select("*")
      .order("started_at", { ascending: false });
    return (data ?? []).map((row) => this.mapSyncRun(row));
  }

  async getAccountLinks(actorId: string): Promise<AccountLink[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db.from("registration_account_links").select("*");
    return (data ?? []).map((row) => this.mapAccountLink(row));
  }

  async linkAccount(
    actorId: string,
    link: Omit<AccountLink, "linkedAt" | "autoMatched">
  ): Promise<AccountLink> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data, error } = await this.db
      .from("registration_account_links")
      .upsert(
        {
          family_id: link.familyId, source: link.source,
          external_id: link.externalId, external_email: link.externalEmail,
          linked_at: new Date().toISOString(), auto_matched: false,
        },
        { onConflict: "family_id,source" }
      )
      .select().single();
    if (error) throw new Error(`link failed: ${error.message}`);
    return this.mapAccountLink(data);
  }

  async unlinkAccount(
    actorId: string,
    familyId: string,
    source: RegistrationSource
  ): Promise<void> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    await this.db.from("registration_account_links")
      .delete().eq("family_id", familyId).eq("source", source);
  }

  async getAccountLinkForFamily(
    actorId: string,
    familyId: string
  ): Promise<AccountLink | null> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("registration_account_links").select("*")
      .eq("family_id", familyId).limit(1);
    return data?.length ? this.mapAccountLink(data[0]) : null;
  }

  async getFsaStatement(
    actorId: string,
    studentId: string,
    period: { start: string; end: string }
  ): Promise<FsaStatement> {
    const actor = await this.actor(actorId);
    const { data: studentRow } = await this.db
      .from("students").select("*").eq("id", studentId).maybeSingle();
    if (!studentRow) throw new Error("Student not found");
    if (!this.isStaffish(actor)) {
      this.assertFamilyAccess(actor, String(studentRow.family_id));
    }
    const [{ data: familyRow }, { data: guardiansRows }, { data: enrollmentsRows },
      classes, productions] = await Promise.all([
      this.db.from("families").select("*").eq("id", studentRow.family_id).maybeSingle(),
      this.db.from("guardians").select("*").eq("family_id", studentRow.family_id),
      this.db.from("enrollments").select("*"),
      this.getClasses(),
      this.getProductions(),
    ]);
    if (!familyRow) throw new Error("Family not found");

    const enrollments = (enrollmentsRows ?? []).map((e) => this.mapEnrollment(e));
    return buildFsaStatement({
      student: mapStudent(studentRow),
      family: mapFamily(familyRow),
      guardians: (guardiansRows ?? []).map((g) => this.mapGuardian(g)),
      enrollments,
      classes,
      productions,
      periodStart: period.start,
      periodEnd: period.end,
      // No override: the amount comes from enrollment.amountPaidCents, synced
      // from the registration system. This used to invent a figure — $220 for a
      // class, $450 for a production — which is not a thing to put on a
      // family's tax paperwork, however plausible it looks.
    });
  }

  /* ── photos & face matching (ported; biometric rules preserved) ────── */

  private mapGallery(row: Row): Gallery {
    return {
      id: String(row.id),
      externalId: String(row.external_id),
      title: String(row.title),
      productionId: s(row.production_id),
      photoCount: Number(row.photo_count ?? 0),
      url: String(row.url),
      createdAt: String(row.created_at),
      ingestedAt: s(row.ingested_at),
    };
  }

  private mapGalleryPhoto(row: Row): GalleryPhoto {
    return {
      id: String(row.id),
      galleryId: String(row.gallery_id),
      externalId: String(row.external_id),
      thumbnailUrl: String(row.thumbnail_url),
      url: String(row.url),
      takenAt: s(row.taken_at),
      width: Number(row.width ?? 0),
      height: Number(row.height ?? 0),
    };
  }

  private mapMatch(row: Row): PhotoMatch {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      photoId: String(row.photo_id),
      similarity: Number(row.similarity),
      state: row.state as PhotoMatch["state"],
      createdAt: String(row.created_at),
      correctedAt: s(row.corrected_at),
    };
  }

  private mapEmbedding(row: Row): FaceEmbedding {
    // pgvector serializes as a "[0.1,0.2,…]" string over the API.
    const raw = row.embedding;
    const vector: number[] =
      typeof raw === "string" ? (JSON.parse(raw) as number[]) : ((raw ?? []) as number[]);
    return {
      id: String(row.id),
      studentId: s(row.student_id),
      photoId: s(row.photo_id),
      vector,
      detectionConfidence: Number(row.detection_confidence),
      createdAt: String(row.created_at),
    };
  }

  private vectorLiteral(vector: number[]): string {
    return `[${vector.join(",")}]`;
  }

  private mapConsentEvent(row: Row): ConsentEvent {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      action: row.action as ConsentEvent["action"],
      actorName: String(row.actor_name ?? ""),
      createdAt: String(row.created_at),
      embeddingsDeleted: row.embeddings_deleted == null ? undefined : Number(row.embeddings_deleted),
      matchesDeleted: row.matches_deleted == null ? undefined : Number(row.matches_deleted),
      referencePhotosDeleted:
        row.reference_photos_deleted == null ? undefined : Number(row.reference_photos_deleted),
    };
  }

  async grantFaceConsent(
    actorId: string,
    studentId: string,
    referenceImageUrls: string[]
  ): Promise<{ embeddingsCreated: number }> {
    const actor = await this.actor(actorId);
    const { data: student } = await this.db
      .from("students").select("family_id").eq("id", studentId).maybeSingle();
    if (!student) throw new Error("Student not found");
    // Only a parent of this child may consent — never staff, never admin.
    if (actor.role !== "parent" || actor.familyId !== String(student.family_id)) {
      throw new AccessDeniedError(
        "Only a parent or guardian of this student can give face-matching consent"
      );
    }
    if (
      referenceImageUrls.length < MIN_REFERENCE_PHOTOS ||
      referenceImageUrls.length > MAX_REFERENCE_PHOTOS
    ) {
      throw new Error(
        `Upload between ${MIN_REFERENCE_PHOTOS} and ${MAX_REFERENCE_PHOTOS} reference photos`
      );
    }

    const faceProvider = getFaceMatchProvider();
    let created = 0;
    for (const imageUrl of referenceImageUrls) {
      await this.db.from("reference_photos").insert({
        student_id: studentId, image_url: imageUrl,
      });
      const faces = await faceProvider.embedFaces(imageUrl);
      for (const face of faces) {
        await this.db.from("face_embeddings").insert({
          student_id: studentId,
          embedding: this.vectorLiteral(face.vector),
          detection_confidence: face.detectionConfidence,
        });
        created += 1;
      }
    }

    if (created === 0) {
      // Roll back the reference photos — consent without a usable face is
      // just retained photos of a child for no purpose.
      await this.db.from("reference_photos").delete().eq("student_id", studentId);
      throw new Error(
        "We couldn't find a face in those photos. Try clearer, front-facing photos."
      );
    }

    await this.db.from("students")
      .update({ consent_face_matching: true, updated_at: new Date().toISOString() })
      .eq("id", studentId);
    await this.db.from("face_consent_events").insert({
      student_id: studentId, action: "granted", actor_name: actor.displayName,
    });
    return { embeddingsCreated: created };
  }

  async revokeFaceConsent(actorId: string, studentId: string): Promise<ConsentEvent> {
    const actor = await this.actor(actorId);
    const { data: student } = await this.db
      .from("students").select("family_id").eq("id", studentId).maybeSingle();
    if (!student) throw new Error("Student not found");
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && (actor.role !== "parent" || actor.familyId !== String(student.family_id))) {
      throw new AccessDeniedError("Only a parent or an admin can revoke consent");
    }

    // Delete everything derived from this child's face, immediately, and
    // record the COUNTS so the family sees proof rather than a promise.
    const { count: embCount } = await this.db
      .from("face_embeddings").select("*", { count: "exact", head: true })
      .eq("student_id", studentId);
    const { count: matchCount } = await this.db
      .from("photo_matches").select("*", { count: "exact", head: true })
      .eq("student_id", studentId);
    const { count: refCount } = await this.db
      .from("reference_photos").select("*", { count: "exact", head: true })
      .eq("student_id", studentId);

    await this.db.from("face_embeddings").delete().eq("student_id", studentId);
    await this.db.from("photo_matches").delete().eq("student_id", studentId);
    await this.db.from("reference_photos").delete().eq("student_id", studentId);
    await this.db.from("students")
      .update({ consent_face_matching: false, updated_at: new Date().toISOString() })
      .eq("id", studentId);

    const { data: event, error } = await this.db
      .from("face_consent_events")
      .insert({
        student_id: studentId, action: "revoked", actor_name: actor.displayName,
        embeddings_deleted: embCount ?? 0,
        matches_deleted: matchCount ?? 0,
        reference_photos_deleted: refCount ?? 0,
      })
      .select().single();
    if (error) throw new Error(`consent event failed: ${error.message}`);
    return this.mapConsentEvent(event);
  }

  async getConsentHistory(actorId: string, studentId: string): Promise<ConsentEvent[]> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return [];
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("face_consent_events").select("*").eq("student_id", studentId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((row) => this.mapConsentEvent(row));
  }

  async getReferencePhotos(actorId: string, studentId: string): Promise<ReferencePhoto[]> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return [];
    // Reference photos are the family's own uploads — family + admin only.
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && actor.familyId !== familyId) {
      throw new AccessDeniedError("Not your student");
    }
    const { data } = await this.db
      .from("reference_photos").select("*").eq("student_id", studentId);
    return (data ?? []).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      imageUrl: String(row.image_url),
      uploadedAt: String(row.uploaded_at),
    }));
  }

  async countEmbeddingsForStudent(actorId: string, studentId: string): Promise<number> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return 0;
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && actor.familyId !== familyId) {
      throw new AccessDeniedError("Not your student");
    }
    const { count } = await this.db
      .from("face_embeddings").select("*", { count: "exact", head: true })
      .eq("student_id", studentId);
    return count ?? 0;
  }

  async getGalleries(actorId: string): Promise<Gallery[]> {
    await this.actor(actorId);
    const { data } = await this.db
      .from("photo_galleries").select("*").order("created_at", { ascending: false });
    return (data ?? []).map((row) => this.mapGallery(row));
  }

  async getGalleryPhotos(actorId: string, galleryId: string): Promise<GalleryPhoto[]> {
    await this.actor(actorId);
    const { data } = await this.db
      .from("gallery_photos").select("*").eq("gallery_id", galleryId);
    return (data ?? []).map((row) => this.mapGalleryPhoto(row));
  }

  async getMatchesForFamily(
    actorId: string,
    familyId: string
  ): Promise<Array<{ match: PhotoMatch; photo: GalleryPhoto; studentName: string }>> {
    const actor = await this.actor(actorId);
    // Matches: the family and admins — NOT staff at large, never another family.
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && actor.familyId !== familyId) {
      throw new AccessDeniedError("Not your family");
    }
    const { data: students } = await this.db
      .from("students").select("id, first_name, preferred_name").eq("family_id", familyId);
    const ids = (students ?? []).map((st) => st.id);
    if (ids.length === 0) return [];
    const [{ data: matches }, { data: photos }] = await Promise.all([
      this.db.from("photo_matches").select("*").in("student_id", ids)
        .neq("state", "rejected").order("created_at", { ascending: false }),
      this.db.from("gallery_photos").select("*"),
    ]);
    return (matches ?? []).flatMap((row) => {
      const photo = (photos ?? []).find((ph) => ph.id === row.photo_id);
      if (!photo) return [];
      const student = (students ?? []).find((st) => st.id === row.student_id);
      return [{
        match: this.mapMatch(row),
        photo: this.mapGalleryPhoto(photo),
        studentName: String(student?.preferred_name ?? student?.first_name ?? ""),
      }];
    });
  }

  private async matchOwnerOrThrow(actorId: string, matchId: string): Promise<Row> {
    const actor = await this.actor(actorId);
    const { data: match } = await this.db
      .from("photo_matches").select("*").eq("id", matchId).maybeSingle();
    if (!match) throw new Error("Match not found");
    const familyId = await this.studentFamilyOrThrow(String(match.student_id));
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && actor.familyId !== familyId) {
      throw new AccessDeniedError("Not your match to correct");
    }
    return match;
  }

  async rejectMatch(actorId: string, matchId: string): Promise<void> {
    await this.matchOwnerOrThrow(actorId, matchId);
    // Keep the row in "rejected" state: it's how we remember never to
    // re-assert this pairing on the next matching run.
    await this.db.from("photo_matches")
      .update({ state: "rejected", corrected_at: new Date().toISOString() })
      .eq("id", matchId);
  }

  async confirmMatch(actorId: string, matchId: string): Promise<void> {
    const match = await this.matchOwnerOrThrow(actorId, matchId);
    await this.db.from("photo_matches")
      .update({ state: "confirmed", corrected_at: new Date().toISOString() })
      .eq("id", matchId);

    // Fold the confirmed face into the student's reference set so future
    // matching gets better at this child specifically.
    const { data: photoEmbedding } = await this.db
      .from("face_embeddings").select("*").eq("photo_id", match.photo_id).limit(1);
    if (photoEmbedding?.length) {
      const emb = this.mapEmbedding(photoEmbedding[0]);
      await this.db.from("face_embeddings").insert({
        student_id: match.student_id,
        embedding: this.vectorLiteral(emb.vector),
        detection_confidence: emb.detectionConfidence,
      });
    }
  }

  async ingestGallery(
    actorId: string,
    gallery: Gallery,
    photos: GalleryPhoto[]
  ): Promise<{ photosIngested: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");

    const { data: galleryRow, error } = await this.db
      .from("photo_galleries")
      .upsert(
        {
          external_id: gallery.externalId, title: gallery.title,
          production_id: gallery.productionId ?? null,
          photo_count: gallery.photoCount, url: gallery.url,
          ingested_at: new Date().toISOString(),
        },
        { onConflict: "external_id" }
      )
      .select().single();
    if (error) throw new Error(`gallery ingest failed: ${error.message}`);

    const { data: existing } = await this.db
      .from("gallery_photos").select("external_id");
    const seen = new Set((existing ?? []).map((ph) => String(ph.external_id)));
    const fresh = photos.filter((photo) => !seen.has(photo.externalId));
    if (fresh.length) {
      await this.db.from("gallery_photos").insert(
        fresh.map((photo) => ({
          gallery_id: galleryRow.id,
          external_id: photo.externalId,
          thumbnail_url: photo.thumbnailUrl,
          url: photo.url,
          taken_at: photo.takenAt ?? null,
          width: photo.width, height: photo.height,
        }))
      );
    }
    return { photosIngested: fresh.length };
  }

  /**
   * Background matching pass. Only students with ACTIVE consent are ever
   * passed to the matcher — the invariant the privacy promise rests on.
   */
  async runMatching(
    actorId: string
  ): Promise<{ photosScanned: number; matchesCreated: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const faceProvider = getFaceMatchProvider();

    const [{ data: consented }, { data: allEmbeddings }, { data: allMatches },
      { data: galleryPhotos }, { data: parents }] = await Promise.all([
      this.db.from("students").select("*").eq("consent_face_matching", true),
      this.db.from("face_embeddings").select("*"),
      this.db.from("photo_matches").select("*"),
      this.db.from("gallery_photos").select("*"),
      this.db.from("profiles").select("id, family_id").eq("role", "parent"),
    ]);
    const embeddings = (allEmbeddings ?? []).map((row) => this.mapEmbedding(row));

    const candidates: CandidateStudent[] = (consented ?? [])
      .map((studentRow) => ({
        studentId: String(studentRow.id),
        embeddings: embeddings.filter((e) => e.studentId === String(studentRow.id)),
        rejectedPhotoIds: new Set(
          (allMatches ?? [])
            .filter((m) => m.student_id === studentRow.id && m.state === "rejected")
            .map((m) => String(m.photo_id))
        ),
      }))
      .filter((candidate) => candidate.embeddings.length > 0);

    let photosScanned = 0;
    let matchesCreated = 0;
    for (const photoRow of galleryPhotos ?? []) {
      photosScanned += 1;
      const photoId = String(photoRow.id);

      // Embed the photo's faces once and cache them.
      const faces = embeddings.filter((e) => e.photoId === photoId);
      if (faces.length === 0) {
        const detected = await faceProvider.embedFaces(String(photoRow.thumbnail_url));
        for (const face of detected) {
          const { data: inserted } = await this.db
            .from("face_embeddings")
            .insert({
              photo_id: photoId,
              embedding: this.vectorLiteral(face.vector),
              detection_confidence: face.detectionConfidence,
            })
            .select().single();
          if (inserted) faces.push(this.mapEmbedding(inserted));
        }
      }

      for (const face of faces) {
        const result = matchFace(face, photoId, candidates);
        if (!result) continue;
        const already = (allMatches ?? []).find(
          (m) => m.student_id === result.studentId && m.photo_id === result.photoId
        );
        if (already) continue;

        const { data: created } = await this.db
          .from("photo_matches")
          .insert({
            student_id: result.studentId, photo_id: result.photoId,
            similarity: result.similarity, state: "matched",
          })
          .select().single();
        if (!created) continue;
        (allMatches ?? []).push(created);
        matchesCreated += 1;

        // Tell the family there are new photos of their child.
        const student = (consented ?? []).find((st) => st.id === result.studentId);
        if (!student) continue;
        const name = String(student.preferred_name ?? student.first_name);
        const familyParents = (parents ?? []).filter(
          (parent) => parent.family_id === student.family_id
        );
        for (const parent of familyParents) {
          const { data: dupe } = await this.db
            .from("notifications").select("id").eq("user_id", parent.id)
            .eq("type", "photos_posted").ilike("body", `%${name}%`).limit(1);
          if (dupe?.length) continue;
          await this.db.from("notifications").insert({
            user_id: parent.id, type: "photos_posted",
            title: "New photos",
            body: `We found new photos of ${name}.`,
            url: "/photos",
          });
        }
      }
    }
    return { photosScanned, matchesCreated };
  }

  /* ── catalog & core reads/writes (ported) ──────────────────────────── */

  async updateFamily(
    actorId: string,
    familyId: string,
    patch: Partial<Family>
  ): Promise<Family> {
    const actor = await this.actor(actorId);
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && !(actor.role === "parent" && actor.familyId === familyId)) {
      throw new AccessDeniedError("Not allowed to modify this family");
    }
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const map: Array<[keyof Family, string]> = [
      ["name", "name"], ["addressLine1", "address_line1"],
      ["addressLine2", "address_line2"], ["city", "city"], ["state", "state"],
      ["zip", "zip"], ["preferredContactMethod", "preferred_contact_method"],
      ["communicationLanguage", "communication_language"],
      ["emergencyContacts", "emergency_contacts"],
      ["authorizedPickups", "authorized_pickups"],
    ];
    for (const [key, col] of map) {
      if (patch[key] !== undefined) row[col] = patch[key];
    }
    // staffNotes only via staff.
    if (patch.staffNotes !== undefined && this.isStaffish(actor)) {
      row.staff_notes = patch.staffNotes;
    }
    const { data, error } = await this.db
      .from("families").update(row).eq("id", familyId).select().single();
    if (error) throw new Error(`family update failed: ${error.message}`);
    const family = mapFamily(data);
    if (!this.isStaffish(actor)) delete family.staffNotes;
    return family;
  }

  private mapGuardian(row: Row): Guardian {
    return {
      id: String(row.id),
      familyId: String(row.family_id),
      userId: s(row.user_id),
      fullName: String(row.full_name),
      email: String(row.email),
      phone: String(row.phone ?? ""),
      relationship: String(row.relationship ?? ""),
      isPrimary: Boolean(row.is_primary),
      photoUrl: s(row.photo_url),
    };
  }

  async getGuardians(actorId: string, familyId: string): Promise<Guardian[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("guardians").select("*").eq("family_id", familyId);
    return (data ?? []).map((row) => this.mapGuardian(row));
  }

  async inviteGuardian(
    actorId: string,
    familyId: string,
    invite: { fullName: string; email: string; relationship: string }
  ): Promise<Guardian> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data, error } = await this.db
      .from("guardians")
      .insert({
        family_id: familyId, full_name: invite.fullName,
        email: invite.email, phone: "", relationship: invite.relationship,
        is_primary: false,
      })
      .select().single();
    if (error) throw new Error(`guardian invite failed: ${error.message}`);
    return this.mapGuardian(data);
  }

  async updateGuardian(
    actorId: string,
    guardianId: string,
    patch: Partial<
      Pick<Guardian, "fullName" | "email" | "phone" | "relationship" | "photoUrl">
    >
  ): Promise<Guardian> {
    const actor = await this.actor(actorId);
    const { data: current, error: readError } = await this.db
      .from("guardians")
      .select("family_id")
      .eq("id", guardianId)
      .maybeSingle();
    if (readError) throw new Error(`guardian lookup failed: ${readError.message}`);
    if (!current) throw new Error("Guardian not found");
    this.assertFamilyAccess(actor, String(current.family_id));

    // Column-by-column rather than a spread: is_primary and user_id decide who
    // the account belongs to, and must not be reachable from a family form.
    const row: Row = {};
    if (patch.fullName !== undefined) row.full_name = patch.fullName;
    if (patch.email !== undefined) row.email = patch.email;
    if (patch.phone !== undefined) row.phone = patch.phone;
    if (patch.relationship !== undefined) row.relationship = patch.relationship;
    if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;

    const { data, error } = await this.db
      .from("guardians")
      .update(row)
      .eq("id", guardianId)
      .select()
      .single();
    if (error) throw new Error(`guardian update failed: ${error.message}`);
    return this.mapGuardian(data);
  }

  async addGuardian(
    actorId: string,
    familyId: string,
    guardian: Pick<Guardian, "fullName" | "email" | "phone" | "relationship">
  ): Promise<Guardian> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data, error } = await this.db
      .from("guardians")
      .insert({
        family_id: familyId,
        full_name: guardian.fullName,
        email: guardian.email,
        phone: guardian.phone,
        relationship: guardian.relationship,
        is_primary: false,
      })
      .select()
      .single();
    if (error) throw new Error(`guardian add failed: ${error.message}`);
    return this.mapGuardian(data);
  }

  async addShowHistoryEntry(
    actorId: string,
    studentId: string,
    entry: Omit<ShowHistoryEntry, "id" | "studentId" | "fromCasting">
  ): Promise<ShowHistoryEntry> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) throw new Error("Student not found");
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data, error } = await this.db
      .from("show_history")
      .insert({
        student_id: studentId, production_title: entry.productionTitle,
        role: entry.role, season_name: entry.seasonName ?? "",
        director: entry.director ?? null, venue: entry.venue ?? null,
        organization: entry.organization ?? null, from_casting: false,
        year: entry.year ?? "",
      })
      .select().single();
    if (error) throw new Error(`show history failed: ${error.message}`);
    return {
      id: String(data.id), studentId, productionTitle: String(data.production_title),
      role: String(data.role), seasonName: String(data.season_name ?? ""),
      director: s(data.director), venue: s(data.venue),
      organization: s(data.organization), fromCasting: false,
      year: String(data.year ?? ""),
    };
  }

  async getCurrentSeason(): Promise<Season> {
    const { data } = await this.db
      .from("seasons").select("*").eq("is_current", true).maybeSingle();
    if (!data) throw new Error("No current season configured");
    return {
      id: String(data.id), name: String(data.name),
      startsOn: String(data.starts_on), endsOn: String(data.ends_on),
      isCurrent: true,
    };
  }

  async getPrograms(seasonId?: string): Promise<Program[]> {
    let query = this.db.from("programs").select("*");
    if (seasonId) query = query.eq("season_id", seasonId);
    const { data } = await query;
    return (data ?? []).map((row) => ({
      id: String(row.id), seasonId: String(row.season_id),
      name: String(row.name), description: s(row.description),
    }));
  }

  async getClasses(programId?: string): Promise<ClassOffering[]> {
    let query = this.db.from("classes").select("*");
    if (programId) query = query.eq("program_id", programId);
    const [{ data: classes }, { data: classStaff }] = await Promise.all([
      query,
      this.db.from("class_staff").select("*"),
    ]);
    return (classes ?? []).map((row) => ({
      id: String(row.id), programId: String(row.program_id),
      name: String(row.name), dayOfWeek: Number(row.day_of_week),
      startTime: String(row.start_time).slice(0, 5),
      endTime: String(row.end_time).slice(0, 5),
      location: String(row.location ?? ""),
      staffIds: (classStaff ?? [])
        .filter((cs) => cs.class_id === row.id)
        .map((cs) => String(cs.staff_id)),
    }));
  }

  async getProductions(seasonId?: string): Promise<Production[]> {
    let query = this.db.from("productions").select("*");
    if (seasonId) query = query.eq("season_id", seasonId);
    const { data } = await query;
    return (data ?? []).map((row) => mapProduction(row));
  }

  private mapEnrollment(row: Row): Enrollment {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      classId: s(row.class_id),
      productionId: s(row.production_id),
      coachingActivityId:
        row.coaching_activity_id == null ? undefined : Number(row.coaching_activity_id),
      status: row.status as Enrollment["status"],
      balanceCents: Number(row.balance_cents ?? 0),
      source: (row.source ?? "manual") as Enrollment["source"],
      offeringCategory: s(row.offering_category),
      amountPaidCents:
        row.amount_paid_cents == null ? undefined : Number(row.amount_paid_cents),
      sessionStartsOn: s(row.session_starts_on),
      sessionEndsOn: s(row.session_ends_on),
      createdAt: String(row.created_at),
    };
  }

  async getEnrollmentsForStudent(actorId: string, studentId: string): Promise<Enrollment[]> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return [];
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("enrollments").select("*").eq("student_id", studentId);
    return (data ?? []).map((row) => this.mapEnrollment(row));
  }

  async getEnrollmentsForFamily(actorId: string, familyId: string): Promise<Enrollment[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data: students } = await this.db
      .from("students").select("id").eq("family_id", familyId);
    const ids = (students ?? []).map((st) => st.id);
    if (ids.length === 0) return [];
    const { data } = await this.db
      .from("enrollments").select("*").in("student_id", ids);
    return (data ?? []).map((row) => this.mapEnrollment(row));
  }

  async getCastingForStudent(actorId: string, studentId: string): Promise<CastingAssignment[]> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return [];
    const staffView = this.isStaffish(actor);
    if (!staffView) this.assertFamilyAccess(actor, familyId);
    let query = this.db.from("casting_assignments").select("*").eq("student_id", studentId);
    // Families see PUBLISHED assignments only.
    if (!staffView) query = query.not("published_at", "is", null);
    const { data } = await query;
    return (data ?? []).map((row) => ({
      id: String(row.id),
      productionId: String(row.production_id),
      studentId: String(row.student_id),
      characterName: String(row.character_name),
      castGroup: s(row.cast_group),
      isUnderstudy: Boolean(row.is_understudy),
      rehearsalTrack: s(row.rehearsal_track),
      publishedAt: s(row.published_at),
    }));
  }

  async getCastingReview(
    actorId: string,
    productionId: string
  ): Promise<Array<{ student: Student; hopes: HopesEntry[] }>> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) {
      throw new AccessDeniedError("Casting review is staff-only");
    }
    const [registered, { data: hopes }] = await Promise.all([
      this.registeredStudents(productionId),
      this.db.from("hopes_entries").select("*"),
    ]);
    return registered.map((student) => ({
      student,
      hopes: (hopes ?? [])
        .filter((h) => h.student_id === student.id)
        .map((h) => this.mapHopes(h)),
    }));
  }

  async updateNotificationPrefs(
    actorId: string,
    prefs: Partial<Omit<NotificationPrefs, "userId">>
  ): Promise<NotificationPrefs> {
    await this.actor(actorId);
    const current = await this.getNotificationPrefs(actorId);
    const merged = {
      enabled: prefs.enabled ?? current.enabled,
      quiet_hours_start: prefs.quietHoursStart ?? current.quietHoursStart ?? null,
      quiet_hours_end: prefs.quietHoursEnd ?? current.quietHoursEnd ?? null,
    };
    const { error } = await this.db
      .from("notification_prefs")
      .upsert({ user_id: actorId, ...merged }, { onConflict: "user_id" });
    if (error) throw new Error(`prefs save failed: ${error.message}`);
    return this.getNotificationPrefs(actorId);
  }

  async broadcastNotification(
    actorId: string,
    input: {
      type: AppNotification["type"];
      title: string;
      body: string;
      url?: string;
      audience: FeedAudience;
    }
  ): Promise<{ recipients: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const parents = (await this.audienceParents(input.audience)).filter(
      (user) => user.id !== actor.id
    );
    // Respect per-type opt-outs.
    const { data: prefs } = await this.db.from("notification_prefs").select("*");
    const allowed = parents.filter((user) => {
      const pref = (prefs ?? []).find((pr) => pr.user_id === user.id);
      const enabled = (pref?.enabled ?? {}) as Record<string, boolean>;
      return enabled[input.type] !== false;
    });
    if (allowed.length) {
      await this.db.from("notifications").insert(
        allowed.map((user) => ({
          user_id: user.id, type: input.type, title: input.title,
          body: input.body, url: input.url ?? null,
        }))
      );
    }
    return { recipients: allowed.length };
  }

  /* ── email, calendar tokens, student materials (ported) ────────────── */

  /** Parents whose family matches a post/email audience. */
  private async audienceParents(audience: FeedAudience): Promise<User[]> {
    const [{ data: parents }, { data: students }, { data: enrollments },
      { data: classes }, { data: productions }] = await Promise.all([
      this.db.from("profiles").select("*").eq("role", "parent"),
      this.db.from("students").select("id, family_id"),
      this.db.from("enrollments").select("*").eq("status", "enrolled"),
      this.db.from("classes").select("id, program_id"),
      this.db.from("productions").select("id, program_id"),
    ]);
    const isEveryone =
      !audience.productionIds?.length &&
      !audience.classIds?.length &&
      !audience.programIds?.length;
    const classPrograms = new Map((classes ?? []).map((c) => [c.id, c.program_id]));
    const productionPrograms = new Map((productions ?? []).map((pr) => [pr.id, pr.program_id]));

    return (parents ?? [])
      .filter((parent) => {
        if (isEveryone) return true;
        const familyStudentIds = new Set(
          (students ?? []).filter((st) => st.family_id === parent.family_id).map((st) => st.id)
        );
        return (enrollments ?? []).some((enrollment) => {
          if (!familyStudentIds.has(enrollment.student_id)) return false;
          if (enrollment.production_id &&
            audience.productionIds?.includes(String(enrollment.production_id))) return true;
          if (enrollment.class_id &&
            audience.classIds?.includes(String(enrollment.class_id))) return true;
          if (audience.programIds?.length) {
            const programId = enrollment.class_id
              ? classPrograms.get(enrollment.class_id)
              : productionPrograms.get(enrollment.production_id);
            if (programId && audience.programIds.includes(String(programId))) return true;
          }
          return false;
        });
      })
      .map(mapUser);
  }

  async resolveAudience(actorId: string, audience: FeedAudience): Promise<User[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    return this.audienceParents(audience);
  }

  async getEmailTemplates(actorId: string): Promise<EmailTemplate[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    // Templates are app configuration (no editor exists yet), shared with
    // the mock so both backends offer identical starting points.
    const seed = await import("../mock/seed-data");
    return structuredClone(seed.emailTemplates);
  }

  private mapEmailSend(row: Row): EmailSend {
    return {
      id: String(row.id),
      templateId: s(row.template_id),
      subject: String(row.subject),
      body: String(row.body),
      category: row.category as EmailSend["category"],
      audience: (row.audience ?? {}) as EmailSend["audience"],
      scheduledFor: s(row.scheduled_for),
      sentAt: s(row.sent_at),
      stats: (row.stats ?? { total: 0, delivered: 0, opened: 0 }) as EmailSend["stats"],
      createdByName: String(row.created_by_name ?? ""),
    };
  }

  async getEmailSends(actorId: string): Promise<EmailSend[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db
      .from("email_sends").select("*").order("sent_at", { ascending: false });
    return (data ?? []).map((row) => this.mapEmailSend(row));
  }

  async sendEmail(
    actorId: string,
    input: {
      templateId?: string;
      subject: string;
      body: string;
      category: EmailSend["category"];
      audience: EmailSend["audience"];
      scheduledFor?: string;
      testToSelf?: boolean;
    }
  ): Promise<EmailSend> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const recipients = input.testToSelf
      ? [actor]
      : await this.audienceParents(input.audience as FeedAudience);

    const { data, error } = await this.db
      .from("email_sends")
      .insert({
        template_id: input.templateId ?? null,
        subject: input.subject,
        body: input.body,
        category: input.category,
        audience: input.audience,
        scheduled_for: input.scheduledFor ?? null,
        sent_at: input.scheduledFor ? null : new Date().toISOString(),
        stats: {
          total: recipients.length,
          delivered: input.scheduledFor ? 0 : recipients.length,
          opened: 0,
        },
        created_by_name: actor.displayName,
      })
      .select().single();
    if (error) throw new Error(`email send failed: ${error.message}`);
    return this.mapEmailSend(data);
  }

  async recordEmailOpen(sendId: string, recipientId: string): Promise<void> {
    // Tracking-pixel endpoint — no actor. Upsert keeps one row per pair.
    await this.db.from("email_opens").upsert(
      { send_id: sendId, recipient_id: recipientId, opened_at: new Date().toISOString() },
      { onConflict: "send_id,recipient_id" }
    );
  }

  async recordEmailClick(sendId: string, recipientId: string, url: string): Promise<void> {
    await this.db.from("email_clicks").insert({
      send_id: sendId, recipient_id: recipientId, url,
    });
  }

  async getEmailEngagement(
    actorId: string,
    sendId: string
  ): Promise<{
    opens: Array<{ recipientId: string; recipientName: string; at: string }>;
    clicks: Array<{ recipientId: string; recipientName: string; url: string; at: string }>;
    nonOpeners: User[];
  }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const [{ data: send }, { data: opens }, { data: clicks }, { data: profiles }] =
      await Promise.all([
        this.db.from("email_sends").select("audience").eq("id", sendId).maybeSingle(),
        this.db.from("email_opens").select("*").eq("send_id", sendId),
        this.db.from("email_clicks").select("*").eq("send_id", sendId),
        this.db.from("profiles").select("*"),
      ]);
    const nameOf = (id: string) =>
      String((profiles ?? []).find((pr) => pr.id === id)?.display_name ?? "");
    const openedIds = new Set((opens ?? []).map((o) => String(o.recipient_id)));
    const recipients = send
      ? await this.audienceParents((send.audience ?? {}) as FeedAudience)
      : [];
    return {
      opens: (opens ?? []).map((o) => ({
        recipientId: String(o.recipient_id),
        recipientName: nameOf(String(o.recipient_id)),
        at: String(o.opened_at),
      })),
      clicks: (clicks ?? []).map((c) => ({
        recipientId: String(c.recipient_id),
        recipientName: nameOf(String(c.recipient_id)),
        url: String(c.url),
        at: String(c.clicked_at),
      })),
      nonOpeners: recipients.filter((user) => !openedIds.has(user.id)),
    };
  }

  async getCalendarToken(actorId: string, familyId: string): Promise<string> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data: existing } = await this.db
      .from("family_calendar_tokens").select("token").eq("family_id", familyId).maybeSingle();
    if (existing) return String(existing.token);
    // The column default generates the token server-side.
    const { data, error } = await this.db
      .from("family_calendar_tokens").insert({ family_id: familyId })
      .select("token").single();
    if (error) throw new Error(`calendar token failed: ${error.message}`);
    return String(data.token);
  }

  async getFamilyIdByCalendarToken(token: string): Promise<string | null> {
    const { data } = await this.db
      .from("family_calendar_tokens").select("family_id").eq("token", token).maybeSingle();
    return data ? String(data.family_id) : null;
  }

  /* ── student materials ── */

  private async materialWrite(
    actorId: string,
    studentId: string,
    patch: Record<string, unknown>
  ): Promise<Student> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) throw new Error("Student not found");
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && !(actor.role === "parent" && actor.familyId === familyId)) {
      throw new AccessDeniedError("Not allowed to modify this family");
    }
    const { data, error } = await this.db
      .from("students")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", studentId).select().single();
    if (error) throw new Error(`student update failed: ${error.message}`);
    return mapStudent(data);
  }

  private async storeFile(bucket: Parameters<typeof assertUploadAllowed>[0], path: string, dataUrl: string): Promise<string> {
    // Type and size are enforced here, not only in the browser.
    assertUploadAllowed(bucket, dataUrl);
    const stored = await getStorageProvider().upload(bucket, path, dataUrl);
    return stored.url;
  }

  async setHeadshot(
    actorId: string,
    studentId: string,
    files: { webDataUrl: string; printDataUrl: string }
  ): Promise<Student> {
    const web = await this.storeFile("headshots", `${studentId}/web.jpg`, files.webDataUrl);
    const print = await this.storeFile("headshots", `${studentId}/print.jpg`, files.printDataUrl);
    return this.materialWrite(actorId, studentId, {
      headshot_url: web, headshot_print_url: print,
    });
  }

  async setResumePdf(actorId: string, studentId: string, dataUrl: string): Promise<Student> {
    const url = await this.storeFile("resumes", `${studentId}/resume.pdf`, dataUrl);
    return this.materialWrite(actorId, studentId, { resume_pdf_url: url });
  }

  async setAuditionAudio(actorId: string, studentId: string, dataUrl: string): Promise<Student> {
    const url = await this.storeFile("audition-audio", `${studentId}/audition`, dataUrl);
    return this.materialWrite(actorId, studentId, { audition_audio_url: url });
  }

  async clearAuditionAudio(actorId: string, studentId: string): Promise<Student> {
    return this.materialWrite(actorId, studentId, { audition_audio_url: null });
  }

  async saveResumeCredits(
    actorId: string,
    studentId: string,
    credits: ResumeCredit[]
  ): Promise<Student> {
    return this.materialWrite(actorId, studentId, { resume_credits: credits });
  }

  /* ── students, hopes, directory, staff self-edit (ported) ──────────── */

  async getUserById(userId: string): Promise<User | null> {
    const { data } = await this.db
      .from("profiles").select("*").eq("id", userId).maybeSingle();
    return data ? mapUser(data) : null;
  }

  async getStudent(actorId: string, studentId: string): Promise<Student | null> {
    const actor = await this.actor(actorId);
    const { data } = await this.db
      .from("students").select("*").eq("id", studentId).maybeSingle();
    if (!data) return null;
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, String(data.family_id));
    return mapStudent(data);
  }

  async updateStudent(
    actorId: string,
    studentId: string,
    patch: Partial<Student>
  ): Promise<Student> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) throw new Error("Student not found");
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && !(actor.role === "parent" && actor.familyId === familyId)) {
      throw new AccessDeniedError("Not allowed to modify this family");
    }

    // familyId is immutable through this path.
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const map: Array<[keyof Student, string]> = [
      ["firstName", "first_name"], ["lastName", "last_name"],
      ["preferredName", "preferred_name"], ["pronouns", "pronouns"],
      ["dateOfBirth", "date_of_birth"], ["grade", "grade"], ["school", "school"],
      ["tshirtSize", "tshirt_size"], ["allergies", "allergies"],
      ["medicalFlags", "medical_flags"], ["headshotUrl", "headshot_url"],
      ["headshotPrintUrl", "headshot_print_url"], ["resumePdfUrl", "resume_pdf_url"],
      ["resumeCredits", "resume_credits"], ["vocalRange", "vocal_range"],
      ["danceExperience", "dance_experience"],
      ["auditionSongUrl", "audition_song_url"], ["auditionAudioUrl", "audition_audio_url"],
      ["hasLogin", "has_login"],
    ];
    for (const [key, col] of map) {
      if (patch[key] !== undefined) row[col] = patch[key];
    }
    if (patch.consents) {
      row.consent_photo_use = patch.consents.photoUse;
      row.consent_face_matching = patch.consents.faceMatching;
      row.consent_directory_visible = patch.consents.directoryVisible;
    }
    const { data, error } = await this.db
      .from("students").update(row).eq("id", studentId).select().single();
    if (error) throw new Error(`student update failed: ${error.message}`);
    return mapStudent(data);
  }

  private mapHopes(row: Row): HopesEntry {
    return {
      id: String(row.id),
      seasonId: String(row.season_id),
      author: row.author as HopesEntry["author"],
      text: String(row.text),
      visibleToStudent: Boolean(row.visible_to_student),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async getHopes(actorId: string, studentId: string): Promise<HopesEntry[]> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return [];
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("hopes_entries").select("*").eq("student_id", studentId)
      .order("created_at");
    const entries = (data ?? []).map((row) => this.mapHopes(row));
    if (actor.role === "student") {
      // Students see their own entries, and parent entries only when shared.
      return entries.filter((e) => e.author === "student" || e.visibleToStudent);
    }
    return entries;
  }

  async upsertHopes(
    actorId: string,
    studentId: string,
    entry: {
      seasonId: string;
      author: "parent" | "student";
      text: string;
      visibleToStudent?: boolean;
    }
  ): Promise<HopesEntry> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) throw new Error("Student not found");
    if (this.isStaffish(actor)) {
      throw new AccessDeniedError("Hopes are written by families, not staff");
    }
    this.assertFamilyAccess(actor, familyId);
    if (entry.author === "parent" && actor.role !== "parent") {
      throw new AccessDeniedError("Only a parent can write parent hopes");
    }

    // Versioned: always append; the newest row is the current version.
    const { data: existing } = await this.db
      .from("hopes_entries").select("visible_to_student")
      .eq("student_id", studentId).eq("season_id", entry.seasonId)
      .eq("author", entry.author)
      .order("created_at", { ascending: false }).limit(1);
    const { data, error } = await this.db
      .from("hopes_entries")
      .insert({
        student_id: studentId,
        season_id: entry.seasonId,
        author: entry.author,
        text: entry.text,
        visible_to_student:
          entry.visibleToStudent ?? Boolean(existing?.[0]?.visible_to_student),
      })
      .select().single();
    if (error) throw new Error(`hopes save failed: ${error.message}`);
    return this.mapHopes(data);
  }

  async getShowHistory(actorId: string, studentId: string): Promise<ShowHistoryEntry[]> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(studentId);
    if (!familyId) return [];
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("show_history").select("*").eq("student_id", studentId)
      .order("year", { ascending: false });
    return (data ?? []).map((row) => ({
      id: String(row.id),
      studentId: String(row.student_id),
      productionTitle: String(row.production_title),
      role: String(row.role),
      seasonName: String(row.season_name ?? ""),
      director: s(row.director),
      venue: s(row.venue),
      organization: s(row.organization),
      fromCasting: Boolean(row.from_casting),
      year: String(row.year ?? ""),
    }));
  }

  async getFamiliesDirectory(actorId: string): Promise<
    Array<{ family: Family; students: Student[]; guardians: Guardian[] }>
  > {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) {
      throw new AccessDeniedError("The family directory is staff-only");
    }
    const [{ data: families }, { data: students }, { data: guardians }] =
      await Promise.all([
        this.db.from("families").select("*"),
        this.db.from("students").select("*"),
        this.db.from("guardians").select("*"),
      ]);
    return (families ?? [])
      .map((row) => {
        const family = mapFamily(row);
        return {
          family,
          students: (students ?? [])
            .filter((st) => st.family_id === family.id).map(mapStudent),
          guardians: (guardians ?? [])
            .filter((g) => g.family_id === family.id)
            .map((g) => ({
              id: String(g.id),
              familyId: String(g.family_id),
              userId: s(g.user_id),
              fullName: String(g.full_name),
              email: String(g.email),
              phone: String(g.phone ?? ""),
              relationship: String(g.relationship ?? ""),
              isPrimary: Boolean(g.is_primary),
            })),
        };
      })
      .sort((a, b) => a.family.name.localeCompare(b.family.name));
  }

  async getStaffProfile(staffId: string): Promise<StaffProfile | null> {
    const { data } = await this.db
      .from("staff_profiles").select("*").eq("id", staffId).maybeSingle();
    return data ? mapStaff(data) : null;
  }

  async submitStaffProfileChanges(
    actorId: string,
    staffId: string,
    changes: {
      bio?: string;
      title?: string;
      specialties?: string[];
      credits?: string;
      photoDataUrl?: string;
    }
  ): Promise<StaffProfile> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && actor.staffId !== staffId) {
      throw new AccessDeniedError("You can only edit your own profile");
    }
    const { data: profileRow } = await this.db
      .from("staff_profiles").select("*").eq("id", staffId).maybeSingle();
    if (!profileRow) throw new Error("Staff profile not found");

    const pending: Record<string, unknown> = {
      ...((profileRow.pending_changes as Record<string, unknown>) ?? {}),
    };
    if (changes.bio !== undefined) pending.bio = changes.bio;
    if (changes.title !== undefined) pending.title = changes.title;
    if (changes.specialties !== undefined) pending.specialties = changes.specialties;
    if (changes.credits !== undefined) pending.credits = changes.credits;
    if (changes.photoDataUrl) {
      assertUploadAllowed("staff-photos", changes.photoDataUrl);
      const stored = await getStorageProvider().upload(
        "staff-photos", `${staffId}/photo-${Date.now()}.jpg`, changes.photoDataUrl
      );
      pending.photoUrl = stored.url;
    }

    const { data, error } = await this.db
      .from("staff_profiles")
      .update({ pending_changes: pending, change_rejection: null })
      .eq("id", staffId).select().single();
    if (error) throw new Error(`profile change failed: ${error.message}`);

    const { data: admins } = await this.db
      .from("profiles").select("id").in("role", ["admin", "super_admin"])
      .neq("id", actor.id);
    if (admins?.length) {
      await this.db.from("notifications").insert(
        admins.map((admin) => ({
          user_id: admin.id, type: "broadcast",
          title: "Staff profile update to review",
          body: `${profileRow.full_name} submitted changes to their profile.`,
          url: "/admin/staff-profiles",
        }))
      );
    }
    return mapStaff(data);
  }

  async getPendingStaffChanges(actorId: string): Promise<StaffProfile[]> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data } = await this.db
      .from("staff_profiles").select("*").not("pending_changes", "is", null);
    return (data ?? []).map(mapStaff);
  }

  async approveStaffChanges(actorId: string, staffId: string): Promise<StaffProfile> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data: row } = await this.db
      .from("staff_profiles").select("*").eq("id", staffId).maybeSingle();
    if (!row) throw new Error("Staff profile not found");
    if (!row.pending_changes) return mapStaff(row);

    const pending = row.pending_changes as Record<string, unknown>;
    const { data, error } = await this.db
      .from("staff_profiles")
      .update({
        ...(pending.bio !== undefined ? { bio: pending.bio } : {}),
        ...(pending.title !== undefined ? { title: pending.title } : {}),
        ...(pending.specialties !== undefined ? { specialties: pending.specialties } : {}),
        ...(pending.credits !== undefined ? { credits: pending.credits } : {}),
        ...(pending.photoUrl !== undefined ? { photo_url: pending.photoUrl } : {}),
        pending_changes: null,
        change_rejection: null,
        is_published: true,
      })
      .eq("id", staffId).select().single();
    if (error) throw new Error(`approve failed: ${error.message}`);

    const { data: owner } = await this.db
      .from("profiles").select("id").eq("staff_id", staffId).maybeSingle();
    if (owner) {
      await this.db.from("notifications").insert({
        user_id: owner.id, type: "broadcast",
        title: "Your profile is live",
        body: "An administrator approved your profile changes.",
        url: `/staff/${staffId}`,
      });
    }
    return mapStaff(data);
  }

  async rejectStaffChanges(
    actorId: string,
    staffId: string,
    reason: string
  ): Promise<StaffProfile> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data, error } = await this.db
      .from("staff_profiles")
      .update({ pending_changes: null, change_rejection: reason })
      .eq("id", staffId).select().single();
    if (error) throw new Error(`reject failed: ${error.message}`);

    const { data: owner } = await this.db
      .from("profiles").select("id").eq("staff_id", staffId).maybeSingle();
    if (owner) {
      await this.db.from("notifications").insert({
        user_id: owner.id, type: "broadcast",
        title: "Profile changes need another pass",
        body: reason,
        url: "/staff/edit",
      });
    }
    return mapStaff(data);
  }

  /* ── private reviews (ported from the mock) ────────────────────────── */

  private mapReviewWindow(row: Row): ReviewWindow {
    return {
      id: String(row.id),
      kind: row.kind as ReviewWindow["kind"],
      subjectType: row.subject_type as ReviewSubjectType,
      subjectId: String(row.subject_id),
      opensAt: String(row.opens_at),
      closesAt: String(row.closes_at),
    };
  }

  private mapReview(row: Row): Review {
    return {
      id: String(row.id),
      windowId: String(row.window_id),
      subjectType: row.subject_type as ReviewSubjectType,
      subjectId: String(row.subject_id),
      reviewerUserId: String(row.reviewer_user_id),
      reviewerName: String(row.reviewer_name ?? ""),
      familyId: String(row.family_id),
      staffIds: ((row.staff_ids ?? []) as string[]).map(String),
      scores: {
        instructionQuality: Number(row.instruction_quality),
        communication: Number(row.communication),
        childGrowth: Number(row.child_growth),
        organization: Number(row.organization),
      },
      comment: String(row.comment ?? ""),
      isAnonymous: Boolean(row.is_anonymous),
      createdAt: String(row.created_at),
      flaggedAt: s(row.flagged_at),
      flagReason: s(row.flag_reason),
      resolvedAt: s(row.resolved_at),
      resolutionNote: s(row.resolution_note),
    };
  }

  private async familyIsEnrolledInSubject(
    familyId: string,
    window: ReviewWindow
  ): Promise<boolean> {
    const { data: students } = await this.db
      .from("students").select("id").eq("family_id", familyId);
    const ids = (students ?? []).map((st) => st.id);
    if (ids.length === 0) return false;
    let query = this.db.from("enrollments").select("id", { count: "exact", head: true })
      .in("student_id", ids).eq("status", "enrolled");
    query = window.subjectType === "class"
      ? query.eq("class_id", window.subjectId)
      : query.eq("production_id", window.subjectId);
    const { count } = await query;
    return (count ?? 0) > 0;
  }

  async getOpenReviewWindows(
    actorId: string
  ): Promise<Array<{ window: ReviewWindow; subjectName: string; alreadySubmitted: boolean }>> {
    const actor = await this.actor(actorId);
    if (!actor.familyId) return [];
    const now = new Date().toISOString();
    const [{ data: windows }, { data: myReviews }, { data: classes }, { data: productions }] =
      await Promise.all([
        this.db.from("review_windows").select("*").lte("opens_at", now).gte("closes_at", now),
        this.db.from("reviews").select("window_id").eq("family_id", actor.familyId),
        this.db.from("classes").select("id, name"),
        this.db.from("productions").select("id, title"),
      ]);

    const results: Array<{ window: ReviewWindow; subjectName: string; alreadySubmitted: boolean }> = [];
    for (const row of windows ?? []) {
      const window = this.mapReviewWindow(row);
      if (!(await this.familyIsEnrolledInSubject(actor.familyId, window))) continue;
      const subjectName =
        window.subjectType === "class"
          ? String((classes ?? []).find((c) => c.id === window.subjectId)?.name ?? "Class")
          : String((productions ?? []).find((pr) => pr.id === window.subjectId)?.title ?? "Production");
      results.push({
        window,
        subjectName,
        alreadySubmitted: (myReviews ?? []).some((r) => r.window_id === window.id),
      });
    }
    return results;
  }

  async submitReview(
    actorId: string,
    input: { windowId: string; scores: ReviewScores; comment: string; isAnonymous: boolean }
  ): Promise<Review> {
    const actor = await this.actor(actorId);
    if (actor.role !== "parent" || !actor.familyId) {
      throw new AccessDeniedError("Only families submit reviews");
    }
    const { data: windowRow } = await this.db
      .from("review_windows").select("*").eq("id", input.windowId).maybeSingle();
    if (!windowRow) throw new Error("Review window not found");
    const window = this.mapReviewWindow(windowRow);

    // Postgres serializes timestamptz as "+00:00", not "Z" — compare as
    // epochs, never as strings.
    const nowMs = Date.now();
    if (Date.parse(window.opensAt) > nowMs || Date.parse(window.closesAt) < nowMs) {
      throw new Error("This review window isn't open");
    }
    if (!(await this.familyIsEnrolledInSubject(actor.familyId, window))) {
      throw new AccessDeniedError("You can only review something you're enrolled in");
    }
    for (const value of Object.values(input.scores)) {
      if (!Number.isInteger(value) || value < 1 || value > 5) {
        throw new Error("Each rating must be between 1 and 5");
      }
    }

    // Which staff this review is about.
    let staffIds: string[] = [];
    if (window.subjectType === "class") {
      const { data } = await this.db
        .from("class_staff").select("staff_id").eq("class_id", window.subjectId);
      staffIds = (data ?? []).map((r) => String(r.staff_id));
    } else {
      const { data } = await this.db
        .from("productions").select("director_staff_id").eq("id", window.subjectId).maybeSingle();
      if (data?.director_staff_id) staffIds = [String(data.director_staff_id)];
    }

    const { data: created, error } = await this.db
      .from("reviews")
      .insert({
        window_id: window.id,
        subject_type: window.subjectType,
        subject_id: window.subjectId,
        reviewer_user_id: actor.id,
        reviewer_name: actor.displayName,
        family_id: actor.familyId,
        staff_ids: staffIds,
        instruction_quality: input.scores.instructionQuality,
        communication: input.scores.communication,
        child_growth: input.scores.childGrowth,
        organization: input.scores.organization,
        comment: input.comment,
        is_anonymous: input.isAnonymous,
      })
      .select().single();
    if (error) {
      // The unique (window_id, family_id) index rejects duplicates.
      if (error.code === "23505") {
        throw new Error("You've already submitted a review for this");
      }
      throw new Error(`review failed: ${error.message}`);
    }
    return this.mapReview(created);
  }

  async getMyReviews(actorId: string): Promise<Review[]> {
    const actor = await this.actor(actorId);
    if (!actor.familyId) return [];
    const { data } = await this.db
      .from("reviews").select("*").eq("family_id", actor.familyId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((row) => this.mapReview(row));
  }

  async getReviewsForStaff(
    actorId: string,
    staffId: string
  ): Promise<{ reviews: StaffReviewView[]; aggregate: ReviewAggregate; trend: TrendPoint[] }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    // A staff member may only read their OWN feedback; admins may read anyone's.
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && actor.staffId !== staffId) {
      throw new AccessDeniedError("You can only see feedback about your own work");
    }
    const { data } = await this.db
      .from("reviews").select("*").contains("staff_ids", [staffId])
      .order("created_at", { ascending: false });
    const relevant = (data ?? []).map((row) => this.mapReview(row));
    return {
      // Identity stripped here — the return type has no reviewer field.
      reviews: relevant.map(toStaffView),
      aggregate: aggregate(relevant, "class", staffId),
      trend: trend(relevant),
    };
  }

  async getAllReviews(actorId: string): Promise<Review[]> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data } = await this.db
      .from("reviews").select("*").order("created_at", { ascending: false });
    return (data ?? []).map((row) => this.mapReview(row));
  }

  async getReviewAggregate(
    actorId: string,
    subjectType: ReviewSubjectType,
    subjectId: string
  ): Promise<{ aggregate: ReviewAggregate; trend: TrendPoint[] }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db
      .from("reviews").select("*")
      .eq("subject_type", subjectType).eq("subject_id", subjectId);
    const relevant = (data ?? []).map((row) => this.mapReview(row));
    return { aggregate: aggregate(relevant, subjectType, subjectId), trend: trend(relevant) };
  }

  async flagReview(actorId: string, reviewId: string, reason: string): Promise<Review> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data, error } = await this.db
      .from("reviews")
      .update({
        flagged_at: new Date().toISOString(), flag_reason: reason,
        resolved_at: null, resolution_note: null,
      })
      .eq("id", reviewId).select().single();
    if (error) throw new Error(`flag failed: ${error.message}`);
    return this.mapReview(data);
  }

  async resolveReview(actorId: string, reviewId: string, note: string): Promise<Review> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data, error } = await this.db
      .from("reviews")
      .update({ resolved_at: new Date().toISOString(), resolution_note: note })
      .eq("id", reviewId).select().single();
    if (error) throw new Error(`resolve failed: ${error.message}`);
    return this.mapReview(data);
  }

  async createReviewWindow(
    actorId: string,
    input: Omit<ReviewWindow, "id">
  ): Promise<ReviewWindow> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const { data, error } = await this.db
      .from("review_windows")
      .insert({
        kind: input.kind, subject_type: input.subjectType,
        subject_id: input.subjectId, opens_at: input.opensAt, closes_at: input.closesAt,
      })
      .select().single();
    if (error) throw new Error(`window create failed: ${error.message}`);
    return this.mapReviewWindow(data);
  }

  /* ── household document vault (ported from the mock) ───────────────── */

  private mapDocument(row: Row): FamilyDocument {
    return {
      id: String(row.id),
      familyId: String(row.family_id),
      studentId: s(row.student_id),
      name: String(row.name),
      category: row.category as DocumentCategory,
      fileUrl: String(row.file_url),
      storagePath: String(row.storage_path),
      contentType: String(row.content_type),
      sizeBytes: Number(row.size_bytes),
      uploadedAt: String(row.uploaded_at),
      uploadedByName: String(row.uploaded_by_name ?? ""),
      uploadedByStaff: Boolean(row.uploaded_by_staff),
    };
  }

  async getFamilyDocuments(actorId: string, familyId: string): Promise<FamilyDocument[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("family_documents").select("*").eq("family_id", familyId)
      .order("uploaded_at", { ascending: false });
    return (data ?? []).map((row) => this.mapDocument(row));
  }

  async uploadFamilyDocument(
    actorId: string,
    familyId: string,
    input: {
      name: string;
      category: DocumentCategory;
      dataUrl: string;
      studentId?: string;
    }
  ): Promise<FamilyDocument> {
    const actor = await this.actor(actorId);
    // Staff may file a document into a family's vault (a signed waiver they
    // received on paper), so this is read-access plus a staff allowance.
    this.assertFamilyAccess(actor, familyId);

    assertUploadAllowed("family-documents", input.dataUrl);
    const path = `${familyId}/${crypto.randomUUID()}`;
    const stored = await getStorageProvider().upload(
      "family-documents", path, input.dataUrl
    );

    const { data, error } = await this.db
      .from("family_documents")
      .insert({
        family_id: familyId,
        student_id: input.studentId ?? null,
        name: input.name,
        category: input.category,
        file_url: stored.url,
        storage_path: path,
        content_type: stored.contentType,
        size_bytes: stored.sizeBytes,
        uploaded_by_name: actor.displayName,
        uploaded_by_staff: this.isStaffish(actor),
      })
      .select().single();
    if (error) throw new Error(`document save failed: ${error.message}`);
    return this.mapDocument(data);
  }

  async deleteFamilyDocument(actorId: string, documentId: string): Promise<void> {
    const actor = await this.actor(actorId);
    const { data: row } = await this.db
      .from("family_documents").select("*").eq("id", documentId).maybeSingle();
    if (!row) return;
    this.assertFamilyAccess(actor, String(row.family_id));

    // A family can remove what they uploaded; only an admin can remove a
    // document staff filed (e.g. a countersigned waiver).
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (row.uploaded_by_staff && !isAdminActor) {
      throw new AccessDeniedError(
        "This document was filed by NOVA PA staff. Contact the office to have it removed."
      );
    }
    await getStorageProvider().remove("family-documents", String(row.storage_path));
    await this.db.from("family_documents").delete().eq("id", documentId);
  }

  /* ── store: buttons, catalog, cart, orders (ported from the mock) ──── */

  private mapTemplate(row: Row): ButtonTemplate {
    return {
      id: String(row.id),
      productionId: String(row.production_id),
      name: String(row.name),
      frameImageUrl: s(row.frame_image_url),
      logoUrl: s(row.logo_url),
      accentColor: String(row.accent_color ?? "#8e1f2f"),
      seasonName: String(row.season_name ?? ""),
      isActive: Boolean(row.is_active),
    };
  }

  private mapProduct(row: Row): Product {
    const config = (row.config ?? {}) as Record<string, unknown>;
    return {
      id: String(row.id),
      type: row.type as Product["type"],
      name: String(row.name),
      description: String(row.description ?? ""),
      basePriceCents: Number(row.base_price_cents),
      productionId: s(row.production_id),
      options: (config.options ?? []) as Product["options"],
      optionLabel: config.optionLabel as string | undefined,
      requiresPhoto: Boolean(config.requiresPhoto),
      requiresMessage: Boolean(config.requiresMessage),
      messageLabel: config.messageLabel as string | undefined,
      messageMaxLength: config.messageMaxLength as number | undefined,
      isActive: Boolean(row.is_active),
    } as Product;
  }

  private mapCartLine(row: Row): CartItem {
    return {
      id: String(row.id),
      quantity: Number(row.quantity),
      unitPriceCents: Number(row.unit_price_cents),
      productType: (row.product_type ?? "spirit_button") as CartItem["productType"],
      productId: s(row.product_id),
      optionValue: s(row.option_value),
      displayName: String(row.display_name ?? ""),
      customization: (row.customization ?? undefined) as Customization | undefined,
      templateId: s(row.template_id),
      photoUrl: s(row.photo_url),
      photoWidth: row.photo_width == null ? undefined : Number(row.photo_width),
      photoHeight: row.photo_height == null ? undefined : Number(row.photo_height),
      studentName: s(row.student_name),
      role: s(row.role),
      size: s(row.size_inches) as ButtonDesign["size"] | undefined,
      style: s(row.style) as ButtonDesign["style"] | undefined,
    };
  }

  private lineToRow(item: CartItem | OrderItem): Record<string, unknown> {
    return {
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      product_type: item.productType,
      product_id: item.productId ?? null,
      option_value: item.optionValue ?? null,
      display_name: item.displayName,
      customization: item.customization ?? null,
      template_id: item.templateId ?? null,
      photo_url: item.photoUrl ?? null,
      photo_width: item.photoWidth ?? null,
      photo_height: item.photoHeight ?? null,
      student_name: item.studentName ?? null,
      role: item.role ?? "",
      size_inches: item.size ?? null,
      style: item.style ?? null,
    };
  }

  private async orderView(row: Row): Promise<ButtonOrder> {
    const { data: items } = await this.db
      .from("button_order_items").select("*").eq("order_id", row.id);
    return {
      id: String(row.id),
      familyId: String(row.family_id),
      reference: String(row.reference),
      items: (items ?? []).map((item) => this.mapCartLine(item) as OrderItem),
      subtotalCents: Number(row.subtotal_cents),
      status: row.status as OrderStatus,
      paymentRef: String(row.payment_ref ?? ""),
      paidAt: s(row.paid_at),
      placedByName: String(row.placed_by_name ?? ""),
      productionId: String(row.production_id ?? ""),
      createdAt: String(row.created_at),
      statusUpdatedAt: String(row.status_updated_at ?? row.created_at),
      adminNote: s(row.admin_note),
    };
  }

  async getButtonTemplates(productionId?: string): Promise<ButtonTemplate[]> {
    let query = this.db.from("button_templates").select("*").eq("is_active", true);
    if (productionId) query = query.eq("production_id", productionId);
    const { data } = await query;
    return (data ?? []).map((row) => this.mapTemplate(row));
  }

  async upsertButtonTemplate(
    actorId: string,
    template: Omit<ButtonTemplate, "id"> & { id?: string }
  ): Promise<ButtonTemplate> {
    const actor = await this.actor(actorId);
    if (actor.role !== "admin" && actor.role !== "super_admin") {
      throw new AccessDeniedError("Admin only");
    }
    const row = {
      ...(template.id ? { id: template.id } : {}),
      production_id: template.productionId,
      name: template.name,
      frame_image_url: template.frameImageUrl ?? null,
      logo_url: template.logoUrl ?? null,
      accent_color: template.accentColor,
      season_name: template.seasonName,
      is_active: template.isActive,
    };
    const { data, error } = await this.db
      .from("button_templates").upsert(row).select().single();
    if (error) throw new Error(`template save failed: ${error.message}`);
    return this.mapTemplate(data);
  }

  async getProducts(productionId?: string): Promise<Product[]> {
    const { data } = await this.db.from("products").select("*").eq("is_active", true);
    return (data ?? [])
      .map((row) => this.mapProduct(row))
      .filter(
        (product) =>
          !productionId || !product.productionId || product.productionId === productionId
      );
  }

  async getCart(actorId: string): Promise<CartItem[]> {
    await this.actor(actorId);
    const { data } = await this.db
      .from("cart_items").select("*").eq("user_id", actorId).order("created_at");
    return (data ?? []).map((row) => this.mapCartLine(row));
  }

  async addToCart(
    actorId: string,
    design: ButtonDesign,
    quantity: number
  ): Promise<CartItem[]> {
    const actor = await this.actor(actorId);
    if (actor.role !== "parent" && !this.isStaffish(actor)) {
      throw new AccessDeniedError("Only families can order buttons");
    }
    if (quantity < 1) throw new Error("Quantity must be at least 1");

    const { error } = await this.db.from("cart_items").insert({
      user_id: actorId,
      ...this.lineToRow({
        ...design,
        id: "",
        quantity,
        unitPriceCents: BUTTON_PRICES_CENTS[design.size],
        productType: "spirit_button",
        displayName: `${design.size}" spirit button — ${design.studentName}`,
      }),
    });
    if (error) throw new Error(`add to cart failed: ${error.message}`);
    return this.getCart(actorId);
  }

  async addCatalogItemToCart(
    actorId: string,
    input: {
      productId: string;
      optionValue?: string;
      quantity: number;
      customization: Customization;
    }
  ): Promise<CartItem[]> {
    const actor = await this.actor(actorId);
    if (actor.role !== "parent" && !this.isStaffish(actor)) {
      throw new AccessDeniedError("Only families can order");
    }
    if (input.quantity < 1) throw new Error("Quantity must be at least 1");

    const { data: productRow } = await this.db
      .from("products").select("*").eq("id", input.productId).maybeSingle();
    if (!productRow || !productRow.is_active) throw new Error("Product not available");
    const product = this.mapProduct(productRow);

    // Reject an option that doesn't belong to this product — otherwise a
    // crafted request could claim a cheaper tier's price.
    if (product.options.length > 0) {
      const valid = product.options.some((option) => option.value === input.optionValue);
      if (!valid) throw new Error("Choose an option");
    }

    // Price is computed here from the catalog, never taken from the client.
    const unitPriceCents = priceFor(product, input.optionValue);
    const optionLabel = product.options.find(
      (option) => option.value === input.optionValue
    )?.label;

    const { error } = await this.db.from("cart_items").insert({
      user_id: actorId,
      ...this.lineToRow({
        id: "",
        quantity: input.quantity,
        unitPriceCents,
        productType: product.type,
        productId: product.id,
        optionValue: input.optionValue,
        displayName: optionLabel ? `${product.name} — ${optionLabel}` : product.name,
        customization: input.customization,
      }),
    });
    if (error) throw new Error(`add to cart failed: ${error.message}`);
    return this.getCart(actorId);
  }

  async updateCartItem(actorId: string, itemId: string, quantity: number): Promise<CartItem[]> {
    await this.actor(actorId);
    if (quantity < 1) {
      await this.db.from("cart_items").delete().eq("id", itemId).eq("user_id", actorId);
    } else {
      await this.db.from("cart_items").update({ quantity })
        .eq("id", itemId).eq("user_id", actorId);
    }
    return this.getCart(actorId);
  }

  async removeCartItem(actorId: string, itemId: string): Promise<CartItem[]> {
    await this.actor(actorId);
    await this.db.from("cart_items").delete().eq("id", itemId).eq("user_id", actorId);
    return this.getCart(actorId);
  }

  async clearCart(actorId: string): Promise<void> {
    await this.actor(actorId);
    await this.db.from("cart_items").delete().eq("user_id", actorId);
  }

  async createOrder(actorId: string, paymentRef: string): Promise<ButtonOrder> {
    const actor = await this.actor(actorId);
    if (!actor.familyId) throw new AccessDeniedError("Only families can order buttons");
    const cart = await this.getCart(actorId);
    if (cart.length === 0) throw new Error("Cart is empty");

    const subtotalCents = cart.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity, 0
    );
    const { data: reference, error: refErr } = await this.db.rpc("next_order_reference");
    if (refErr) throw new Error(`order reference failed: ${refErr.message}`);

    const firstTemplate = cart.find((item) => item.templateId)?.templateId;
    const { data: template } = firstTemplate
      ? await this.db.from("button_templates").select("production_id")
          .eq("id", firstTemplate).maybeSingle()
      : { data: null };

    const { data: order, error } = await this.db
      .from("button_orders")
      .insert({
        family_id: actor.familyId,
        reference: String(reference),
        subtotal_cents: subtotalCents,
        status: "new",
        payment_ref: paymentRef,
        placed_by_name: actor.displayName,
        production_id: template?.production_id ?? null,
      })
      .select().single();
    if (error) throw new Error(`order create failed: ${error.message}`);

    const { error: itemsErr } = await this.db.from("button_order_items").insert(
      cart.map((item) => ({ order_id: order.id, ...this.lineToRow(item) }))
    );
    if (itemsErr) throw new Error(`order items failed: ${itemsErr.message}`);
    await this.clearCart(actorId);
    return this.orderView(order);
  }

  async markOrderPaid(orderReference: string, paymentRef: string): Promise<ButtonOrder | null> {
    // Called from the payment webhook — no actor session available. It can
    // only flip an unpaid order to paid.
    const { data: order } = await this.db
      .from("button_orders").select("*").eq("reference", orderReference).maybeSingle();
    if (!order) return null;
    if (!order.paid_at) {
      const { data: updated } = await this.db
        .from("button_orders")
        .update({ paid_at: new Date().toISOString(), payment_ref: paymentRef })
        .eq("id", order.id).select().single();
      return this.orderView(updated!);
    }
    return this.orderView(order);
  }

  async getOrdersForFamily(actorId: string, familyId: string): Promise<ButtonOrder[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("button_orders").select("*").eq("family_id", familyId)
      .order("created_at", { ascending: false });
    return Promise.all((data ?? []).map((row) => this.orderView(row)));
  }

  async getOrder(actorId: string, orderId: string): Promise<ButtonOrder | null> {
    const actor = await this.actor(actorId);
    const { data } = await this.db
      .from("button_orders").select("*").eq("id", orderId).maybeSingle();
    if (!data) return null;
    this.assertFamilyAccess(actor, String(data.family_id));
    return this.orderView(data);
  }

  async getAllOrders(actorId: string, status?: OrderStatus): Promise<ButtonOrder[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    let query = this.db.from("button_orders").select("*").order("created_at");
    if (status) query = query.eq("status", status);
    const { data } = await query;
    return Promise.all((data ?? []).map((row) => this.orderView(row)));
  }

  async updateOrderStatus(
    actorId: string,
    orderId: string,
    status: OrderStatus,
    note?: string
  ): Promise<ButtonOrder> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const patch: Record<string, unknown> = {
      status, status_updated_at: new Date().toISOString(),
    };
    if (note !== undefined) patch.admin_note = note;
    const { data: order, error } = await this.db
      .from("button_orders").update(patch).eq("id", orderId).select().single();
    if (error) throw new Error(`status update failed: ${error.message}`);

    // Tell the family when their buttons are ready to collect.
    if (status === "ready" || status === "delivered") {
      const { data: parents } = await this.db
        .from("profiles").select("id")
        .eq("family_id", order.family_id).eq("role", "parent");
      if (parents?.length) {
        await this.db.from("notifications").insert(
          parents.map((parent) => ({
            user_id: parent.id,
            type: "broadcast",
            title:
              status === "ready"
                ? `Order ${order.reference} is ready`
                : `Order ${order.reference} delivered`,
            body:
              status === "ready"
                ? "Your spirit buttons are ready to pick up at the front desk."
                : "Your spirit buttons have been handed off. Enjoy!",
            url: "/store/orders",
          }))
        );
      }
    }
    return this.orderView(order);
  }

  async reorder(actorId: string, orderId: string): Promise<CartItem[]> {
    const actor = await this.actor(actorId);
    const { data: order } = await this.db
      .from("button_orders").select("*").eq("id", orderId).maybeSingle();
    if (!order) throw new Error("Order not found");
    this.assertFamilyAccess(actor, String(order.family_id));
    const view = await this.orderView(order);
    if (view.items.length) {
      await this.db.from("cart_items").insert(
        view.items.map((item) => ({ user_id: actorId, ...this.lineToRow(item) }))
      );
    }
    return this.getCart(actorId);
  }

  /* ── early drop-off / late pick-up (ported from the mock) ──────────── */

  private mapPickup(row: Row): PickupRequest {
    return {
      id: String(row.id),
      studentId: String(row.student_id),
      familyId: String(row.family_id),
      kind: row.kind as PickupRequest["kind"],
      startDate: String(row.start_date),
      endDate: String(row.end_date),
      recurringDays: (row.recurring_days ?? []) as number[],
      dropOffTime: row.drop_off_time ? String(row.drop_off_time).slice(0, 5) : undefined,
      pickUpTime: row.pick_up_time ? String(row.pick_up_time).slice(0, 5) : undefined,
      reason: String(row.reason ?? ""),
      supervisingAdult: s(row.supervising_adult),
      authorizedPickupPerson: s(row.authorized_pickup_person),
      feeCents: Number(row.fee_cents ?? 0),
      status: row.status as PickupRequest["status"],
      decisionNote: s(row.decision_note),
      decidedByName: s(row.decided_by_name),
      decidedAt: s(row.decided_at),
      arrivedAt: s(row.arrived_at),
      arrivedByName: s(row.arrived_by_name),
      createdAt: String(row.created_at),
    };
  }

  async markPickupArrived(
    actorId: string,
    requestId: string,
    byName: string
  ): Promise<{ request: PickupRequest; alreadyArrived: boolean }> {
    await this.actor(actorId);
    const { data: current, error: readError } = await this.db
      .from("pickup_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (readError) throw new Error(`pickup lookup failed: ${readError.message}`);
    if (!current) throw new Error("Request not found");

    // Idempotent: a second press must not restart the clock or fire a second
    // alert. RLS decides whether this family may touch the row at all.
    if (current.arrived_at) {
      return { request: this.mapPickup(current), alreadyArrived: true };
    }

    const { data, error } = await this.db
      .from("pickup_requests")
      .update({ arrived_at: new Date().toISOString(), arrived_by_name: byName })
      .eq("id", requestId)
      .select()
      .single();
    if (error) throw new Error(`arrival failed: ${error.message}`);
    return { request: this.mapPickup(data), alreadyArrived: false };
  }

  async getPickupRequestsForFamily(actorId: string, familyId: string): Promise<PickupRequest[]> {
    const actor = await this.actor(actorId);
    this.assertFamilyAccess(actor, familyId);
    const { data } = await this.db
      .from("pickup_requests").select("*").eq("family_id", familyId)
      .order("created_at", { ascending: false });
    return (data ?? []).map((row) => this.mapPickup(row));
  }

  async createPickupRequest(
    actorId: string,
    input: Omit<
      PickupRequest,
      "id" | "familyId" | "status" | "createdAt" | "decisionNote" | "decidedByName" | "decidedAt" | "feeCents"
    >
  ): Promise<PickupRequest> {
    const actor = await this.actor(actorId);
    const familyId = await this.studentFamilyOrThrow(input.studentId);
    if (!familyId) throw new Error("Student not found");
    const isAdminActor = actor.role === "admin" || actor.role === "super_admin";
    if (!isAdminActor && !(actor.role === "parent" && actor.familyId === familyId)) {
      throw new AccessDeniedError("Not allowed to modify this family");
    }

    // Flat $5/day fee for extended care; org can change this later.
    const days = Math.max(
      1,
      Math.round(
        (new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / 86_400_000
      ) + 1
    );
    const { data, error } = await this.db
      .from("pickup_requests")
      .insert({
        student_id: input.studentId,
        family_id: familyId,
        kind: input.kind,
        start_date: input.startDate,
        end_date: input.endDate,
        recurring_days: input.recurringDays ?? [],
        drop_off_time: input.dropOffTime ?? null,
        pick_up_time: input.pickUpTime ?? null,
        reason: input.reason ?? "",
        supervising_adult: input.supervisingAdult ?? null,
        authorized_pickup_person: input.authorizedPickupPerson ?? null,
        fee_cents: 500 * days,
        status: "pending",
      })
      .select().single();
    if (error) throw new Error(`pickup request failed: ${error.message}`);
    return this.mapPickup(data);
  }

  async getPickupRequestsForStaff(actorId: string): Promise<PickupRequest[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db.from("pickup_requests").select("*");
    return (data ?? [])
      .map((row) => this.mapPickup(row))
      .sort((a, b) => {
        if ((a.status === "pending") !== (b.status === "pending")) {
          return a.status === "pending" ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }

  async decidePickupRequest(
    actorId: string,
    requestId: string,
    decision: { status: "approved" | "denied"; note?: string }
  ): Promise<PickupRequest> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data: updated, error } = await this.db
      .from("pickup_requests")
      .update({
        status: decision.status,
        decision_note: decision.note ?? null,
        decided_by_name: actor.displayName,
        decided_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select().single();
    if (error) throw new Error(`decision failed: ${error.message}`);
    const request = this.mapPickup(updated);

    const [{ data: parents }, { data: student }] = await Promise.all([
      this.db.from("profiles").select("id")
        .eq("family_id", request.familyId).eq("role", "parent"),
      this.db.from("students").select("first_name").eq("id", request.studentId).maybeSingle(),
    ]);
    if (parents?.length) {
      await this.db.from("notifications").insert(
        parents.map((parent) => ({
          user_id: parent.id,
          type: "form_due",
          title: `Pick-up request ${decision.status}`,
          body: `${student?.first_name ?? "Your student"}: ${decision.note ?? "See details in the app."}`,
          url: "/family/pickup",
        }))
      );
    }
    return request;
  }

  /* ── feed: staff post, families react & ask (ported from the mock) ─── */

  private mapPost(row: Row): FeedPost {
    return {
      id: String(row.id),
      authorStaffId: String(row.author_staff_id ?? ""),
      authorName: String(row.author_name ?? ""),
      title: s(row.title),
      body: String(row.body),
      imageUrls: (row.image_urls ?? []) as string[],
      videoEmbedUrl: s(row.video_embed_url),
      linkUrl: s(row.link_url),
      category: row.category as FeedCategory,
      audience: (row.audience ?? {}) as FeedAudience,
      isPinned: Boolean(row.is_pinned),
      publishedAt: String(row.published_at),
      reactionCounts: (row.reaction_counts ?? { heart: 0, clap: 0, star: 0 }) as FeedPost["reactionCounts"],
    };
  }

  private mapQuestion(row: Row): PostQuestion {
    return {
      id: String(row.id),
      postId: String(row.post_id),
      askerUserId: String(row.asker_user_id),
      askerName: String(row.asker_name ?? ""),
      question: String(row.question),
      answer: s(row.answer),
      answeredByName: s(row.answered_by_name),
      answeredAt: s(row.answered_at),
      isPublicFaq: Boolean(row.is_public_faq),
      createdAt: String(row.created_at),
    };
  }

  async getFeedForUser(actorId: string): Promise<FeedPost[]> {
    const actor = await this.actor(actorId);
    const { data: posts } = await this.db.from("feed_posts").select("*");
    let visible = (posts ?? []).map((row) => this.mapPost(row));

    if (!this.isStaffish(actor)) {
      // Audience filtering mirrors the mock: empty audience = everyone;
      // otherwise the family needs an enrollment matching it.
      const { data: students } = await this.db
        .from("students").select("id").eq("family_id", actor.familyId ?? "");
      const studentIds = (students ?? []).map((st) => st.id);
      const { data: enrollments } = studentIds.length
        ? await this.db.from("enrollments").select("*")
            .in("student_id", studentIds).eq("status", "enrolled")
        : { data: [] as Row[] };
      const [{ data: classes }, { data: productions }] = await Promise.all([
        this.db.from("classes").select("id, program_id"),
        this.db.from("productions").select("id, program_id"),
      ]);
      const classPrograms = new Map((classes ?? []).map((c) => [c.id, c.program_id]));
      const productionPrograms = new Map(
        (productions ?? []).map((pr) => [pr.id, pr.program_id])
      );

      visible = visible.filter((post) => {
        const audience = post.audience;
        const isEveryone =
          !audience.productionIds?.length &&
          !audience.classIds?.length &&
          !audience.programIds?.length;
        if (isEveryone) return true;
        return (enrollments ?? []).some((enrollment) => {
          if (
            enrollment.production_id &&
            audience.productionIds?.includes(String(enrollment.production_id))
          )
            return true;
          if (
            enrollment.class_id &&
            audience.classIds?.includes(String(enrollment.class_id))
          )
            return true;
          if (audience.programIds?.length) {
            const programId = enrollment.class_id
              ? classPrograms.get(enrollment.class_id)
              : productionPrograms.get(enrollment.production_id);
            if (programId && audience.programIds.includes(String(programId))) return true;
          }
          return false;
        });
      });
    }

    return visible.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.publishedAt.localeCompare(a.publishedAt);
    });
  }

  async createFeedPost(
    actorId: string,
    input: {
      title?: string;
      body: string;
      category: FeedCategory;
      audience: FeedAudience;
      isPinned?: boolean;
      imageUrls?: string[];
      linkUrl?: string;
    }
  ): Promise<FeedPost> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Only staff can post");
    const { data, error } = await this.db
      .from("feed_posts")
      .insert({
        author_staff_id: actor.staffId ?? null,
        author_name: actor.displayName,
        title: input.title ?? null,
        body: input.body,
        image_urls: input.imageUrls ?? [],
        link_url: input.linkUrl ?? null,
        category: input.category,
        audience: input.audience,
        is_pinned: input.isPinned ?? false,
        reaction_counts: { heart: 0, clap: 0, star: 0 },
      })
      .select().single();
    if (error) throw new Error(`post create failed: ${error.message}`);
    return this.mapPost(data);
  }

  async reactToPost(actorId: string, postId: string, kind: ReactionKind): Promise<FeedPost> {
    await this.actor(actorId);
    const { data: row } = await this.db
      .from("feed_posts").select("*").eq("id", postId).maybeSingle();
    if (!row) throw new Error("Post not found");
    const counts = { heart: 0, clap: 0, star: 0, ...(row.reaction_counts ?? {}) } as Record<string, number>;
    counts[kind] = (counts[kind] ?? 0) + 1;
    const { data: updated, error } = await this.db
      .from("feed_posts").update({ reaction_counts: counts }).eq("id", postId)
      .select().single();
    if (error) throw new Error(`reaction failed: ${error.message}`);
    return this.mapPost(updated);
  }

  async askQuestion(actorId: string, postId: string, question: string): Promise<PostQuestion> {
    const actor = await this.actor(actorId);
    if (!question.trim()) throw new Error("Write a question first");
    const { data, error } = await this.db
      .from("post_questions")
      .insert({
        post_id: postId,
        asker_user_id: actor.id,
        asker_name: actor.displayName,
        question: question.trim(),
      })
      .select().single();
    if (error) throw new Error(`question failed: ${error.message}`);
    return this.mapQuestion(data);
  }

  async getQuestionsForPost(actorId: string, postId: string): Promise<PostQuestion[]> {
    const actor = await this.actor(actorId);
    const { data } = await this.db
      .from("post_questions").select("*").eq("post_id", postId).order("created_at");
    return (data ?? [])
      .map((row) => this.mapQuestion(row))
      .filter(
        (q) =>
          this.isStaffish(actor) || q.askerUserId === actor.id || q.isPublicFaq
      );
  }

  async answerQuestion(
    actorId: string,
    questionId: string,
    answer: string,
    publishAsFaq: boolean
  ): Promise<PostQuestion> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data: updated, error } = await this.db
      .from("post_questions")
      .update({
        answer: answer.trim(),
        answered_by_name: actor.displayName,
        answered_at: new Date().toISOString(),
        is_public_faq: publishAsFaq,
      })
      .eq("id", questionId)
      .select().single();
    if (error) throw new Error(`answer failed: ${error.message}`);

    // Tell the asker their question was answered.
    await this.db.from("notifications").insert({
      user_id: updated.asker_user_id,
      type: "broadcast",
      title: "Your question was answered",
      body: String(updated.question).slice(0, 120),
      url: "/feed",
    });
    return this.mapQuestion(updated);
  }

  async getOpenQuestions(actorId: string): Promise<PostQuestion[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db
      .from("post_questions").select("*").is("answer", null).order("created_at");
    return (data ?? []).map((row) => this.mapQuestion(row));
  }

  /* ── direct messages to the office (ported from the mock) ──────────── */

  private mapThread(row: Row): MessageThread {
    return {
      id: String(row.id),
      familyId: String(row.family_id),
      recipientRole: row.recipient_role as MessageThread["recipientRole"],
      subject: String(row.subject ?? ""),
      studentId: s(row.student_id),
      status: row.status as MessageThread["status"],
      createdAt: String(row.created_at),
      lastMessageAt: String(row.last_message_at ?? row.created_at),
      urgent: Boolean(row.urgent),
    };
  }

  private mapMessage(row: Row): Message {
    return {
      id: String(row.id),
      threadId: String(row.thread_id),
      authorUserId: String(row.sender_user_id),
      authorName: String(row.sender_name ?? ""),
      authorSide: (row.author_side ?? "family") as Message["authorSide"],
      body: String(row.body),
      createdAt: String(row.created_at),
      readAt: s(row.read_at),
    };
  }

  /** Admins cover everything; health_safety additionally its director. */
  private async coversRole(actor: User, role: MessageThread["recipientRole"]): Promise<boolean> {
    if (actor.role === "admin" || actor.role === "super_admin") return true;
    if (role !== "health_safety") return false;
    if (!actor.staffId) return false;
    const { data } = await this.db
      .from("staff_profiles").select("is_health_safety_director")
      .eq("id", actor.staffId).maybeSingle();
    return Boolean(data?.is_health_safety_director);
  }

  private async notifyRoleCoverage(
    role: MessageThread["recipientRole"],
    title: string,
    body: string,
    url: string
  ): Promise<void> {
    const [{ data: staffUsers }, { data: hsProfiles }] = await Promise.all([
      this.db.from("profiles").select("id, role, staff_id")
        .in("role", ["staff", "admin", "super_admin"]),
      this.db.from("staff_profiles").select("id").eq("is_health_safety_director", true),
    ]);
    const hsIds = new Set((hsProfiles ?? []).map((pr) => pr.id));
    const recipients = (staffUsers ?? []).filter((u) =>
      u.role === "admin" || u.role === "super_admin"
        ? true
        : role === "health_safety" && u.staff_id && hsIds.has(u.staff_id)
    );
    if (recipients.length) {
      await this.db.from("notifications").insert(
        recipients.map((u) => ({
          user_id: u.id, type: "direct_message", title, body, url,
        }))
      );
    }
  }

  async startMessageThread(
    actorId: string,
    input: {
      recipientRole: MessageThread["recipientRole"];
      subject: string;
      body: string;
      studentId?: string;
    }
  ): Promise<MessageThread> {
    const actor = await this.actor(actorId);
    if (!actor.familyId) {
      throw new AccessDeniedError("Only families start message threads");
    }
    if (!input.subject.trim() || !input.body.trim()) {
      throw new Error("Add a subject and a message");
    }
    if (input.studentId) {
      const { data: student } = await this.db
        .from("students").select("family_id").eq("id", input.studentId).maybeSingle();
      if (!student || String(student.family_id) !== actor.familyId) {
        throw new AccessDeniedError("That isn't your student");
      }
    }

    const now = new Date().toISOString();
    const { data: thread, error } = await this.db
      .from("message_threads")
      .insert({
        family_id: actor.familyId,
        recipient_role: input.recipientRole,
        subject: input.subject.trim(),
        student_id: input.studentId ?? null,
        status: "open",
        last_message_at: now,
      })
      .select().single();
    if (error) throw new Error(`thread create failed: ${error.message}`);

    const { error: msgErr } = await this.db.from("messages").insert({
      thread_id: thread.id,
      sender_user_id: actor.id,
      sender_name: actor.displayName,
      author_side: "family",
      body: input.body.trim(),
    });
    if (msgErr) throw new Error(`message insert failed: ${msgErr.message}`);

    await this.notifyRoleCoverage(
      input.recipientRole,
      input.recipientRole === "health_safety"
        ? "New health & safety message"
        : "New message from a family",
      input.subject.trim(),
      `/admin/messages/${thread.id}`
    );
    return this.mapThread(thread);
  }

  private async assertThreadAccess(actor: User, thread: MessageThread): Promise<void> {
    if (actor.familyId === thread.familyId) return;
    if (this.isStaffish(actor) && (await this.coversRole(actor, thread.recipientRole))) return;
    throw new AccessDeniedError("Not your conversation");
  }

  async replyToThread(actorId: string, threadId: string, body: string): Promise<Message> {
    const actor = await this.actor(actorId);
    const { data: threadRow } = await this.db
      .from("message_threads").select("*").eq("id", threadId).maybeSingle();
    if (!threadRow) throw new Error("Thread not found");
    const thread = this.mapThread(threadRow);
    await this.assertThreadAccess(actor, thread);
    if (!body.trim()) throw new Error("Write a message first");

    const fromStaff = this.isStaffish(actor);
    const { data: message, error } = await this.db
      .from("messages")
      .insert({
        thread_id: threadId,
        sender_user_id: actor.id,
        sender_name: actor.displayName,
        author_side: fromStaff ? "staff" : "family",
        body: body.trim(),
      })
      .select().single();
    if (error) throw new Error(`reply failed: ${error.message}`);

    // A reply reopens a closed thread — the conversation clearly isn't done.
    await this.db.from("message_threads")
      .update({
        last_message_at: String(message.created_at),
        ...(thread.status === "closed" ? { status: "open" } : {}),
      })
      .eq("id", threadId);

    if (fromStaff) {
      const { data: parents } = await this.db
        .from("profiles").select("id").eq("family_id", thread.familyId).eq("role", "parent");
      if (parents?.length) {
        await this.db.from("notifications").insert(
          parents.map((parent) => ({
            user_id: parent.id, type: "direct_message",
            title: "Reply from NOVA PA", body: thread.subject,
            url: `/messages/${thread.id}`,
          }))
        );
      }
    } else {
      await this.notifyRoleCoverage(
        thread.recipientRole, "New reply from a family", thread.subject,
        `/admin/messages/${thread.id}`
      );
    }
    return this.mapMessage(message);
  }

  private async threadView(thread: MessageThread): Promise<ThreadWithMessages> {
    const [{ data: messages }, { data: family }, student] = await Promise.all([
      this.db.from("messages").select("*").eq("thread_id", thread.id).order("created_at"),
      this.db.from("families").select("name").eq("id", thread.familyId).maybeSingle(),
      thread.studentId
        ? this.db.from("students").select("first_name, preferred_name, last_name")
            .eq("id", thread.studentId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const st = (student as { data: Row | null }).data;
    return {
      thread,
      messages: (messages ?? []).map((m) => this.mapMessage(m)),
      familyName: String(family?.name ?? ""),
      studentName: st
        ? `${st.preferred_name ?? st.first_name} ${st.last_name}`
        : undefined,
    };
  }

  async getMyThreads(actorId: string): Promise<MessageThread[]> {
    const actor = await this.actor(actorId);
    if (!actor.familyId) return [];
    const { data } = await this.db
      .from("message_threads").select("*").eq("family_id", actor.familyId)
      .order("last_message_at", { ascending: false });
    return (data ?? []).map((row) => this.mapThread(row));
  }

  async getThread(actorId: string, threadId: string): Promise<ThreadWithMessages | null> {
    const actor = await this.actor(actorId);
    const { data } = await this.db
      .from("message_threads").select("*").eq("id", threadId).maybeSingle();
    if (!data) return null;
    const thread = this.mapThread(data);
    await this.assertThreadAccess(actor, thread);
    return this.threadView(thread);
  }

  async getStaffInbox(actorId: string): Promise<ThreadWithMessages[]> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { data } = await this.db.from("message_threads").select("*");
    const visible: MessageThread[] = [];
    for (const row of data ?? []) {
      const thread = this.mapThread(row);
      if (await this.coversRole(actor, thread.recipientRole)) visible.push(thread);
    }
    visible.sort((a, b) => {
      if ((a.status === "open") !== (b.status === "open")) {
        return a.status === "open" ? -1 : 1;
      }
      return b.lastMessageAt.localeCompare(a.lastMessageAt);
    });
    return Promise.all(visible.map((thread) => this.threadView(thread)));
  }

  async setThreadStatus(
    actorId: string,
    threadId: string,
    status: MessageThread["status"]
  ): Promise<MessageThread> {
    const actor = await this.actor(actorId);
    const { data: row } = await this.db
      .from("message_threads").select("*").eq("id", threadId).maybeSingle();
    if (!row) throw new Error("Thread not found");
    const thread = this.mapThread(row);
    if (!this.isStaffish(actor) || !(await this.coversRole(actor, thread.recipientRole))) {
      throw new AccessDeniedError("Staff only");
    }
    const { data: updated, error } = await this.db
      .from("message_threads").update({ status }).eq("id", threadId).select().single();
    if (error) throw new Error(`status update failed: ${error.message}`);
    return this.mapThread(updated);
  }

  async markThreadRead(actorId: string, threadId: string): Promise<void> {
    const actor = await this.actor(actorId);
    const { data: row } = await this.db
      .from("message_threads").select("*").eq("id", threadId).maybeSingle();
    if (!row) return;
    await this.assertThreadAccess(actor, this.mapThread(row));
    const mySide = this.isStaffish(actor) ? "staff" : "family";
    // You read the *other* side's messages.
    await this.db
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .neq("author_side", mySide)
      .is("read_at", null);
  }

  async getUnreadMessageCount(actorId: string): Promise<number> {
    const actor = await this.actor(actorId);
    const { data: threads } = await this.db.from("message_threads").select("*");
    const visibleIds: string[] = [];
    for (const row of threads ?? []) {
      const thread = this.mapThread(row);
      if (
        actor.familyId === thread.familyId ||
        (this.isStaffish(actor) && (await this.coversRole(actor, thread.recipientRole)))
      ) {
        visibleIds.push(thread.id);
      }
    }
    if (visibleIds.length === 0) return 0;
    const mySide = this.isStaffish(actor) ? "staff" : "family";
    const { count } = await this.db
      .from("messages")
      .select("*", { count: "exact", head: true })
      .in("thread_id", visibleIds)
      .neq("author_side", mySide)
      .is("read_at", null);
    return count ?? 0;
  }

  /* ── background jobs: reminders & rehearsal notices ────────────────── */

  async remindPendingCastingConfirmations(
    actorId: string,
    options?: { olderThanMs?: number }
  ): Promise<{ reminded: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const olderThanMs = options?.olderThanMs ?? CONFIRMATION_REMINDER_MS;
    // olderThanMs <= 0 means "everything unanswered is due" (test override).
    const cutoff =
      olderThanMs <= 0 ? Number.POSITIVE_INFINITY : Date.now() - olderThanMs;

    const [{ data: confirmations }, { data: students }, { data: assignments }, { data: parents }] =
      await Promise.all([
        this.db.from("casting_confirmations").select("*").is("name_correct", null),
        this.db.from("students").select("id, first_name, preferred_name"),
        this.db.from("casting_assignments").select("id, character_name"),
        this.db.from("profiles").select("id, family_id").eq("role", "parent"),
      ]);

    let reminded = 0;
    for (const confirmation of confirmations ?? []) {
      const last = confirmation.last_reminded_at
        ? new Date(String(confirmation.last_reminded_at)).getTime()
        : 0;
      if (last > cutoff) continue; // reminded recently

      const student = (students ?? []).find((st) => st.id === confirmation.student_id);
      const assignment = (assignments ?? []).find(
        (a) => a.id === confirmation.assignment_id
      );
      if (!student || !assignment) continue;

      const familyParents = (parents ?? []).filter(
        (parent) => parent.family_id === confirmation.family_id
      );
      if (familyParents.length) {
        await this.db.from("notifications").insert(
          familyParents.map((parent) => ({
            user_id: parent.id,
            type: "casting_released",
            title: "Reminder: confirm the playbill name",
            body: `${student.preferred_name ?? student.first_name}'s role (${assignment.character_name}) is waiting on your confirmation.`,
            url: "/casting",
          }))
        );
      }
      await this.db
        .from("casting_confirmations")
        .update({
          last_reminded_at: new Date().toISOString(),
          reminder_count: Number(confirmation.reminder_count ?? 0) + 1,
        })
        .eq("id", confirmation.id);
      reminded += 1;
    }
    return { reminded };
  }

  async runRehearsalNotices(
    actorId: string,
    options?: { now?: string }
  ): Promise<{ reminders: number; thanks: number }> {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const now = options?.now ? new Date(options.now).getTime() : Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const [
      { data: events }, { data: enrollments }, { data: students },
      { data: cast }, { data: roles }, { data: scenes },
      { data: parents }, { data: notices },
    ] = await Promise.all([
      this.db.from("calendar_events").select("*").in("type", ["rehearsal", "tech", "performance"]),
      this.db.from("enrollments").select("*").eq("status", "enrolled"),
      this.db.from("students").select("id, family_id, first_name, preferred_name"),
      this.db.from("casting_assignments").select("*").not("published_at", "is", null),
      this.db.from("show_roles").select("*"),
      this.db.from("show_scenes").select("*"),
      this.db.from("profiles").select("id, family_id").eq("role", "parent"),
      this.db.from("event_notices").select("*"),
    ]);

    const heldRoleIds = (studentId: string, productionId: string): Set<string> => {
      const held = new Set<string>();
      for (const a of cast ?? []) {
        if (a.student_id !== studentId || a.production_id !== productionId) continue;
        for (const r of roles ?? []) {
          if (r.production_id !== productionId) continue;
          if (a.character_name === r.name) held.add(String(r.id));
          else if (a.is_understudy && a.character_name === `${r.name} (Understudy)`)
            held.add(String(r.id));
        }
      }
      return held;
    };
    const studentCalled = (student: Row, event: Row): boolean => {
      const enrolled = (enrollments ?? []).some(
        (e) =>
          e.student_id === student.id &&
          ((event.class_id && e.class_id === event.class_id) ||
            (event.production_id && e.production_id === event.production_id))
      );
      if (!enrolled) return false;
      const sceneIds = (event.scene_ids ?? null) as string[] | null;
      if (!sceneIds?.length || !event.production_id) return true;
      const held = heldRoleIds(String(student.id), String(event.production_id));
      if (held.size === 0) return true; // pre-publication fallback
      return (scenes ?? []).some(
        (sc) =>
          sceneIds.includes(String(sc.id)) &&
          ((sc.role_ids ?? []) as string[]).some((rid) => held.has(rid))
      );
    };
    const alreadySent = (eventKey: string, familyId: string, kind: string) =>
      (notices ?? []).some(
        (n) => n.event_key === eventKey && n.family_id === familyId && n.kind === kind
      );
    const whenText = (ms: number) =>
      new Date(ms).toLocaleString("en-US", {
        weekday: "long", hour: "numeric", minute: "2-digit",
        timeZone: "America/New_York",
      });

    let reminders = 0;
    let thanks = 0;
    for (const event of events ?? []) {
      const startsAt = new Date(String(event.starts_at)).getTime();
      const endsAt = new Date(String(event.ends_at)).getTime();
      const dueReminder = startsAt > now && startsAt <= now + DAY;
      const dueThanks = endsAt <= now && endsAt > now - DAY;
      if (!dueReminder && !dueThanks) continue;

      const namesByFamily = new Map<string, string[]>();
      for (const student of students ?? []) {
        if (!studentCalled(student, event)) continue;
        const names = namesByFamily.get(String(student.family_id)) ?? [];
        names.push(String(student.preferred_name ?? student.first_name));
        namesByFamily.set(String(student.family_id), names);
      }

      for (const [familyId, familyNames] of namesByFamily) {
        const kind = dueReminder ? "reminder" : "thanks";
        if (alreadySent(String(event.id), familyId, kind)) continue;

        const names = familyNames.join(" & ");
        const familyParents = (parents ?? []).filter((pr) => pr.family_id === familyId);
        if (familyParents.length) {
          await this.db.from("notifications").insert(
            familyParents.map((parent) => ({
              user_id: parent.id,
              type: "schedule_change",
              title:
                kind === "reminder"
                  ? `Tomorrow: ${event.title}`
                  : "Thank you for a great rehearsal!",
              body:
                kind === "reminder"
                  ? `${names} ${names.includes("&") ? "are" : "is"} called ${whenText(startsAt)} at ${event.location}.${event.what_to_bring ? ` Bring: ${event.what_to_bring}.` : ""}`
                  : `${names} did wonderful work at ${event.title}. See the calendar for what's next.`,
              url: "/calendar",
            }))
          );
        }
        await this.db.from("event_notices").insert({
          event_key: String(event.id), family_id: familyId, kind,
        });
        if (kind === "reminder") reminders += 1;
        else thanks += 1;
      }
    }

    // Private lessons ride the same job: 24h-before reminder per booking.
    const [{ data: bookings }, { data: slots }, { data: staff }] = await Promise.all([
      this.db.from("lesson_bookings").select("*").eq("status", "active"),
      this.db.from("lesson_slots").select("*"),
      this.db.from("staff_profiles").select("id, full_name"),
    ]);
    for (const booking of bookings ?? []) {
      const slotRow = (slots ?? []).find((sl) => sl.id === booking.slot_id);
      if (!slotRow) continue;
      const slot = this.mapSlot(slotRow);
      const startMs = nextLessonOccurrence(slot, now);
      if (!(startMs > now && startMs <= now + DAY)) continue;

      const eventKey = `lesson-${booking.id}-${new Date(startMs).toISOString().slice(0, 10)}`;
      if (alreadySent(eventKey, String(booking.family_id), "reminder")) continue;

      const student = (students ?? []).find((st) => st.id === booking.student_id);
      const teacher = (staff ?? []).find((t) => t.id === slot.teacherStaffId);
      const label =
        LESSON_DISCIPLINES.find((d) => d.value === slot.discipline)?.label ?? "Private";
      const familyParents = (parents ?? []).filter(
        (pr) => pr.family_id === booking.family_id
      );
      if (familyParents.length) {
        await this.db.from("notifications").insert(
          familyParents.map((parent) => ({
            user_id: parent.id,
            type: "schedule_change",
            title: `Tomorrow: ${label} lesson`,
            body: `${student?.preferred_name ?? student?.first_name ?? "Your student"}'s ${label.toLowerCase()} lesson with ${teacher?.full_name ?? "NOVA PA"} is ${whenText(startMs)} at ${slot.location}.`,
            url: "/store/lessons",
          }))
        );
      }
      await this.db.from("event_notices").insert({
        event_key: eventKey, family_id: booking.family_id, kind: "reminder",
      });
      reminders += 1;
    }
    return { reminders, thanks };
  }

  /* ── private lessons (ported from the mock) ────────────────────────── */

  private mapSlot(row: Row): LessonSlot {
    return {
      id: String(row.id),
      teacherStaffId: String(row.teacher_staff_id),
      discipline: row.discipline as LessonSlot["discipline"],
      weekday: Number(row.weekday),
      // Postgres `time` serializes as "16:30:00"; the app uses "16:30".
      startTime: String(row.start_time).slice(0, 5),
      durationMin: Number(row.duration_min),
      location: String(row.location ?? ""),
      pricePerLessonCents: Number(row.price_per_lesson_cents),
    };
  }

  private mapBooking(row: Row): LessonBooking {
    return {
      id: String(row.id),
      slotId: String(row.slot_id),
      studentId: String(row.student_id),
      familyId: String(row.family_id),
      startDate: String(row.start_date),
      status: row.status as LessonBooking["status"],
      goals: s(row.goals),
      paymentMethod: "studio_invoice",
      createdAt: String(row.created_at),
      cancelledAt: s(row.cancelled_at),
    };
  }

  private async lessonWorld() {
    const [{ data: slots }, { data: bookings }, { data: staff }, { data: students }] =
      await Promise.all([
        this.db.from("lesson_slots").select("*"),
        this.db.from("lesson_bookings").select("*").eq("status", "active"),
        this.db.from("staff_profiles").select("id, user_id, full_name, title"),
        this.db.from("students").select("id, family_id, first_name, preferred_name, last_name"),
      ]);
    return { slots: slots ?? [], bookings: bookings ?? [], staff: staff ?? [], students: students ?? [] };
  }

  async getLessonSlots(actorId: string): Promise<
    Array<{
      slot: LessonSlot;
      teacherName: string;
      teacherTitle: string;
      status: "open" | "taken" | "yours";
      bookingId?: string;
      studentName?: string;
    }>
  > {
    const actor = await this.actor(actorId);
    const staffView = this.isStaffish(actor);
    const { slots, bookings, staff, students } = await this.lessonWorld();

    return slots
      .map((row) => {
        const slot = this.mapSlot(row);
        const teacher = staff.find((t) => t.id === row.teacher_staff_id);
        const booking = bookings.find((b) => b.slot_id === row.id);
        const mine = booking && actor.familyId === booking.family_id;
        const student = booking
          ? students.find((st) => st.id === booking.student_id)
          : undefined;
        return {
          slot,
          teacherName: String(teacher?.full_name ?? "NOVA PA"),
          teacherTitle: String(teacher?.title ?? ""),
          status: (booking ? (mine ? "yours" : "taken") : "open") as
            | "open" | "taken" | "yours",
          // Who holds a slot is private: families see "taken", never a name.
          bookingId: mine || staffView ? String(booking?.id) : undefined,
          studentName:
            (mine || staffView) && student
              ? `${student.preferred_name ?? student.first_name} ${student.last_name}`
              : undefined,
        };
      })
      .sort(
        (a, b) =>
          a.teacherName.localeCompare(b.teacherName) ||
          a.slot.weekday - b.slot.weekday ||
          a.slot.startTime.localeCompare(b.slot.startTime)
      );
  }

  async bookLessonSlot(
    actorId: string,
    input: { slotId: string; studentId: string; goals?: string }
  ): Promise<LessonBooking> {
    const actor = await this.actor(actorId);
    const { data: slotRow } = await this.db
      .from("lesson_slots").select("*").eq("id", input.slotId).maybeSingle();
    if (!slotRow) throw new Error("That lesson time no longer exists");
    const { data: student } = await this.db
      .from("students").select("*").eq("id", input.studentId).maybeSingle();
    if (!student) throw new Error("Student not found");
    if (!this.isStaffish(actor)) {
      this.assertFamilyAccess(actor, String(student.family_id));
    }

    const slot = this.mapSlot(slotRow);
    const startMs = nextLessonOccurrence(slot, Date.now());
    const { data: created, error } = await this.db
      .from("lesson_bookings")
      .insert({
        slot_id: slot.id,
        student_id: student.id,
        family_id: student.family_id,
        start_date: new Date(startMs).toISOString().slice(0, 10),
        status: "active",
        goals: input.goals?.trim() || null,
        payment_method: "studio_invoice",
      })
      .select().single();
    if (error) {
      // The partial unique index rejects a second active booking.
      if (error.message.includes("lesson_slot_one_active_idx") || error.code === "23505") {
        throw new Error("That time was just taken — pick another open slot");
      }
      throw new Error(`booking failed: ${error.message}`);
    }

    const { data: teacher } = await this.db
      .from("staff_profiles").select("user_id, full_name")
      .eq("id", slot.teacherStaffId).maybeSingle();
    const label =
      LESSON_DISCIPLINES.find((d) => d.value === slot.discipline)?.label ?? "Private";
    const studentName = String(student.preferred_name ?? student.first_name);
    const booking = this.mapBooking(created);

    const { data: parents } = await this.db
      .from("profiles").select("id").eq("family_id", student.family_id).eq("role", "parent");
    const notifications: Array<Record<string, unknown>> = (parents ?? []).map((parent) => ({
      user_id: parent.id,
      type: "schedule_change",
      title: `Weekly ${label.toLowerCase()} lesson booked 🎉`,
      body: `${studentName} has a standing ${label.toLowerCase()} lesson with ${teacher?.full_name ?? "NOVA PA"}, starting ${booking.startDate}. It's on your family calendar.`,
      url: "/store/lessons",
    }));
    if (teacher?.user_id) {
      notifications.push({
        user_id: teacher.user_id,
        type: "schedule_change",
        title: "New weekly lesson student",
        body: `${studentName} ${student.last_name} booked your ${label.toLowerCase()} slot, starting ${booking.startDate}.`,
        url: "/admin/lessons",
      });
    }
    if (notifications.length) await this.db.from("notifications").insert(notifications);
    return booking;
  }

  async cancelLessonBooking(actorId: string, bookingId: string): Promise<void> {
    const actor = await this.actor(actorId);
    const { data: row } = await this.db
      .from("lesson_bookings").select("*").eq("id", bookingId)
      .eq("status", "active").maybeSingle();
    if (!row) throw new Error("Booking not found");
    if (!this.isStaffish(actor)) this.assertFamilyAccess(actor, String(row.family_id));

    const { error } = await this.db
      .from("lesson_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", bookingId);
    if (error) throw new Error(`cancel failed: ${error.message}`);

    const { data: slot } = await this.db
      .from("lesson_slots").select("start_time, teacher_staff_id").eq("id", row.slot_id).maybeSingle();
    const { data: teacher } = slot
      ? await this.db.from("staff_profiles").select("user_id").eq("id", slot.teacher_staff_id).maybeSingle()
      : { data: null };
    const { data: student } = await this.db
      .from("students").select("first_name, preferred_name").eq("id", row.student_id).maybeSingle();
    if (teacher?.user_id) {
      await this.db.from("notifications").insert({
        user_id: teacher.user_id,
        type: "schedule_change",
        title: "Weekly lesson cancelled",
        body: `${student?.preferred_name ?? student?.first_name ?? "A student"}'s weekly slot (${slot ? `${String(slot.start_time).slice(0, 5)} lessons` : "lesson"}) is open again.`,
        url: "/admin/lessons",
      });
    }
  }

  async getMyLessonBookings(actorId: string): Promise<
    Array<{
      booking: LessonBooking;
      slot: LessonSlot;
      teacherName: string;
      studentName: string;
      nextLessonAt: string;
    }>
  > {
    const actor = await this.actor(actorId);
    if (!actor.familyId) return [];
    const { slots, bookings, staff, students } = await this.lessonWorld();

    return bookings
      .filter((b) => b.family_id === actor.familyId)
      .flatMap((b) => {
        const slotRow = slots.find((sl) => sl.id === b.slot_id);
        if (!slotRow) return [];
        const slot = this.mapSlot(slotRow);
        const teacher = staff.find((t) => t.id === slotRow.teacher_staff_id);
        const student = students.find((st) => st.id === b.student_id);
        return [{
          booking: this.mapBooking(b),
          slot,
          teacherName: String(teacher?.full_name ?? "NOVA PA"),
          studentName: student
            ? `${student.preferred_name ?? student.first_name} ${student.last_name}`
            : "Student",
          nextLessonAt: new Date(nextLessonOccurrence(slot, Date.now())).toISOString(),
        }];
      });
  }

  async getLessonRoster(actorId: string): Promise<
    Array<{
      slot: LessonSlot;
      teacherName: string;
      studentName?: string;
      familyName?: string;
      goals?: string;
      startDate?: string;
    }>
  > {
    const actor = await this.actor(actorId);
    if (!this.isStaffish(actor)) throw new AccessDeniedError("Staff only");
    const { slots, bookings, staff, students } = await this.lessonWorld();
    const { data: families } = await this.db.from("families").select("id, name");

    return slots
      .map((row) => {
        const slot = this.mapSlot(row);
        const teacher = staff.find((t) => t.id === row.teacher_staff_id);
        const booking = bookings.find((b) => b.slot_id === row.id);
        const student = booking
          ? students.find((st) => st.id === booking.student_id)
          : undefined;
        const family = booking
          ? (families ?? []).find((f) => f.id === booking.family_id)
          : undefined;
        return {
          slot,
          teacherName: String(teacher?.full_name ?? "NOVA PA"),
          studentName: student
            ? `${student.preferred_name ?? student.first_name} ${student.last_name}`
            : undefined,
          familyName: family ? String(family.name) : undefined,
          goals: booking ? s(booking.goals) : undefined,
          startDate: booking ? String(booking.start_date) : undefined,
        };
      })
      .sort(
        (a, b) =>
          a.teacherName.localeCompare(b.teacherName) ||
          a.slot.weekday - b.slot.weekday ||
          a.slot.startTime.localeCompare(b.slot.startTime)
      );
  }
}

/**
 * Factory: full DataProvider surface, loud failures for unported methods.
 * As slices are ported, methods move from "throws" to "works" with the
 * behavior pinned by the same tests the mock passes.
 */
export function createSupabaseProvider(): DataProvider {
  const impl = new SupabaseDataProvider();
  return new Proxy(impl, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (value !== undefined) {
        return typeof value === "function" ? value.bind(target) : value;
      }
      if (typeof prop !== "string") return value;
      return () => {
        throw new Error(
          `SupabaseDataProvider.${prop} is not ported yet — this screen still requires the mock backend (NEXT_PUBLIC_DATA_MODE=mock).`
        );
      };
    },
  }) as unknown as DataProvider;
}
