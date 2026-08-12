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
  upcomingLessonOccurrences,
} from "../lessons/types";
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
