import "server-only";
import { getServiceClient } from "@/lib/api/supabase/client";
import type { Production, SessionUser } from "@/lib/api/types";

/**
 * "My Shows" reads. Assignments live in family_hub.production_staff,
 * mirrored hourly from the staff portal by the schedule bridge — so a
 * staffing change in the portal moves someone's show list within the hour.
 *
 * Access rule (Tony's): admins and super admins see EVERY show; staff see
 * the shows they're assigned to. Supabase mode only — the pages that call
 * this redirect elsewhere in mock mode.
 */

export interface MyShow {
  production: Production;
  /** The caller's roles on this show (empty for admins browsing all). */
  myRoles: string[];
  enrolledCount: number;
}

export interface ShowTeamMember {
  staffId: string;
  name: string;
  role: string;
}

function mapProductionRow(row: Record<string, unknown>): Production {
  return {
    id: String(row.id),
    programId: String(row.program_id),
    seasonId: String(row.season_id),
    title: String(row.title),
    venue: String(row.venue ?? ""),
    directorStaffId: row.director_staff_id ? String(row.director_staff_id) : undefined,
    opensOn: row.opens_on ? String(row.opens_on) : undefined,
    closesOn: row.closes_on ? String(row.closes_on) : undefined,
    buttonTemplateUrl: row.button_template_url ? String(row.button_template_url) : undefined,
    ticketsUrl: row.tickets_url ? String(row.tickets_url) : undefined,
    curriculumUrl: row.curriculum_url ? String(row.curriculum_url) : undefined,
  };
}

export async function getMyShows(user: SessionUser): Promise<MyShow[]> {
  const db = getServiceClient();
  const isAdmin = user.role === "admin" || user.role === "super_admin";

  const [{ data: productions }, { data: assignments }, { data: enrollments }] =
    await Promise.all([
      db.from("productions").select("*"),
      db.from("production_staff").select("production_id, staff_id, role"),
      db.from("enrollments").select("production_id").eq("status", "enrolled").range(0, 4999),
    ]);

  const enrolledByProduction = new Map<string, number>();
  for (const e of enrollments ?? []) {
    if (!e.production_id) continue;
    const id = String(e.production_id);
    enrolledByProduction.set(id, (enrolledByProduction.get(id) ?? 0) + 1);
  }

  const myStaffId = user.staffId;
  const mineByProduction = new Map<string, string[]>();
  for (const a of assignments ?? []) {
    if (myStaffId && String(a.staff_id) === myStaffId) {
      const id = String(a.production_id);
      mineByProduction.set(id, [...(mineByProduction.get(id) ?? []), String(a.role)]);
    }
  }

  const shows = (productions ?? [])
    .filter((p) => isAdmin || mineByProduction.has(String(p.id)))
    .map((p) => ({
      production: mapProductionRow(p as Record<string, unknown>),
      myRoles: mineByProduction.get(String(p.id)) ?? [],
      enrolledCount: enrolledByProduction.get(String(p.id)) ?? 0,
    }));

  // My assigned shows first, then by enrollment size.
  return shows.sort(
    (a, b) =>
      Number(b.myRoles.length > 0) - Number(a.myRoles.length > 0) ||
      b.enrolledCount - a.enrolledCount ||
      a.production.title.localeCompare(b.production.title)
  );
}

export async function getShowTeam(productionId: string): Promise<ShowTeamMember[]> {
  const db = getServiceClient();
  const [{ data: assignments }, { data: staff }] = await Promise.all([
    db.from("production_staff").select("staff_id, role").eq("production_id", productionId),
    db.from("staff_profiles").select("id, full_name"),
  ]);
  const nameById = new Map((staff ?? []).map((s) => [String(s.id), String(s.full_name)]));
  return (assignments ?? [])
    .map((a) => ({
      staffId: String(a.staff_id),
      name: nameById.get(String(a.staff_id)) ?? "Staff member",
      role: String(a.role),
    }))
    .sort((a, b) => (a.role === "Director" ? -1 : b.role === "Director" ? 1 : a.role.localeCompare(b.role)));
}

/** May this user open a show dashboard? Admins always; staff when assigned. */
export async function canAccessShow(user: SessionUser, productionId: string): Promise<boolean> {
  if (user.role === "admin" || user.role === "super_admin") return true;
  if (!user.staffId) return false;
  const db = getServiceClient();
  const { data } = await db
    .from("production_staff")
    .select("staff_id")
    .eq("production_id", productionId)
    .eq("staff_id", user.staffId)
    .limit(1);
  return (data ?? []).length > 0;
}
