import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AccessDeniedError, type DataProvider } from "../provider";
import type {
  AppNotification,
  Family,
  StaffProfile,
  Student,
  User,
  Production,
} from "../types";
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
