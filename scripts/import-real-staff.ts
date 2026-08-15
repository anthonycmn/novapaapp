/**
 * Give the real staff-portal team access to the family hub's staff tools.
 *
 * Reads staff_portal.portal_users + staff_portal.staff READ-ONLY and
 * creates in family_hub:
 *   - a profiles row on each ACTIVE portal user's EXISTING auth account
 *     (they sign in with their portal password; no auth changes), role
 *     mapped per Tony's rule — chief → super_admin, admin/director →
 *     admin, staff → staff. An existing PARENT profile is upgraded in
 *     role but keeps its family link (staff who are also parents see
 *     both sides).
 *   - a staff_profiles row (name, title, health&safety flag) so casting,
 *     lessons, and the staff directory have real people. Bios start
 *     unpublished — staff fill them in via the approval flow.
 *
 * Idempotent; never writes to staff_portal or public.
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/import-real-staff.ts
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const hub = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
});
// READ-ONLY window onto the portal's schema. Never write through this.
const portal = createClient(url, key, {
  auth: { persistSession: false },
  db: { schema: "staff_portal" },
}) as typeof hub;

const ROLE_MAP: Record<string, "super_admin" | "admin" | "staff"> = {
  chief: "super_admin",
  admin: "admin",
  director: "admin", // Tony: directors get everything staff can see and more
  staff: "staff",
};
const RANK = { student: 0, parent: 1, staff: 2, admin: 3, super_admin: 4 } as const;

async function main() {
  const { data: portalUsers, error } = await portal
    .from("portal_users")
    .select("auth_user_id, email, full_name, role, staff_id, is_active, is_safety_officer");
  if (error) throw new Error(`portal_users: ${error.message}`);

  const { data: portalStaff, error: staffError } = await portal
    .from("staff")
    .select("id, full_name, preferred_name, job_title");
  if (staffError) throw new Error(`staff: ${staffError.message}`);
  const staffById = new Map((portalStaff ?? []).map((s) => [String(s.id), s]));

  const { data: profiles } = await hub.from("profiles").select("id, email, role");
  const profileById = new Map((profiles ?? []).map((p) => [String(p.id), p]));
  const { data: hubStaff } = await hub.from("staff_profiles").select("id, user_id");
  const staffByUserId = new Set((hubStaff ?? []).map((s) => String(s.user_id)));

  let created = 0;
  let upgraded = 0;
  let staffRows = 0;
  for (const pu of portalUsers ?? []) {
    if (!pu.is_active || !pu.auth_user_id) continue;
    const mapped = ROLE_MAP[String(pu.role)] ?? "staff";
    const authId = String(pu.auth_user_id);
    const email = String(pu.email ?? "").toLowerCase();
    const detail = pu.staff_id ? staffById.get(String(pu.staff_id)) : undefined;
    const displayName = String(
      detail?.preferred_name ?? detail?.full_name ?? pu.full_name ?? email
    );

    const existing = profileById.get(authId);
    if (!existing) {
      const { error: insErr } = await hub.from("profiles").insert({
        id: authId,
        email,
        display_name: displayName,
        role: mapped,
      });
      if (insErr) throw new Error(`profile ${email}: ${insErr.message}`);
      created++;
    } else if (RANK[existing.role as keyof typeof RANK] < RANK[mapped]) {
      const { error: upErr } = await hub
        .from("profiles").update({ role: mapped }).eq("id", authId);
      if (upErr) throw new Error(`role upgrade ${email}: ${upErr.message}`);
      upgraded++;
    }

    if (!staffByUserId.has(authId)) {
      const staffProfileId = randomUUID();
      const { error: spErr } = await hub.from("staff_profiles").insert({
        id: staffProfileId,
        user_id: authId,
        full_name: String(detail?.full_name ?? pu.full_name ?? displayName),
        title: String(detail?.job_title ?? ""),
        is_published: false,
        is_health_safety_director: Boolean(pu.is_safety_officer),
      });
      if (spErr) throw new Error(`staff_profile ${email}: ${spErr.message}`);
      await hub.from("profiles").update({ staff_id: staffProfileId }).eq("id", authId);
      staffRows++;
    }
    console.log(`  ${email}: ${String(pu.role)} → ${mapped}${pu.is_safety_officer ? " (health&safety)" : ""}`);
  }

  console.log(`\nprofiles created: ${created}, roles upgraded: ${upgraded}, staff profiles: ${staffRows}`);
}

main().catch((e) => {
  console.error("STAFF IMPORT FAILED:", e.message ?? e);
  process.exit(1);
});
