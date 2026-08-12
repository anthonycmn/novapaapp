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
import type {
  CastingConfirmation,
  ShowRole,
  ShowScene,
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
