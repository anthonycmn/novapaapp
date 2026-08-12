import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessDeniedError, type DataProvider } from "../provider";
import type {
  AppNotification,
  CalendarEvent,
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
          rq.kind === "early_dropoff" ? `Early drop-off approved (${rq.drop_off_time})`
          : rq.kind === "late_pickup" ? `Late pick-up approved (${rq.pick_up_time})`
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
