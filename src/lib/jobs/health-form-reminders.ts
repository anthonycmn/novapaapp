import { getServiceClient } from "@/lib/api/supabase/client";

/**
 * The reminder job the health forms have been waiting for.
 *
 * Migration 0003 shipped `health_forms_expiring()` "for the 30/14/3-day
 * reminder job" — and no job was ever written, so on the day of the Sep 5
 * 2026 audit, 24 of 308 enrolled children had a signed form and the other
 * 284 families had never once been asked. The rule this enforces is printed
 * on /family/documents already: "We cannot take a child into a rehearsal
 * without one for this season."
 *
 * WHO GETS NUDGED. Every family with an actively enrolled student whose
 * current-season form is missing, unsigned, or expiring within 14 days.
 * Enrollment is the gate — a history-only family is never chased for a
 * child who isn't coming to rehearsal.
 *
 * HOW OFTEN. At most once per family per 7 days, however many children are
 * behind — the dedupe reads the notification record itself, so redeploys
 * and retries can't double-send. The nav badge (lib/nav-alerts) carries the
 * permanent mark between nudges; this job is the knock on the door.
 *
 * Type is `form_due`, the type the settings page has always LABELLED as
 * "Forms — health forms due or expiring" — this job makes the label true.
 * (Pickup decisions, which borrowed the type, now have their own — see the
 * same-day change in provider.ts.)
 */

const REMINDER_SPACING_DAYS = 7;
const EXPIRY_WINDOW_DAYS = 14;

type Row = Record<string, unknown>;
const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

export interface HealthFormReminderResult {
  familiesNeedingForms: number;
  familiesNotified: number;
  familiesSkippedRecent: number;
  studentsBehind: number;
}

export async function runHealthFormReminders(): Promise<HealthFormReminderResult> {
  const db = getServiceClient();

  const { data: season } = await db
    .from("seasons")
    .select("id")
    .eq("is_current", true)
    .limit(1)
    .maybeSingle();
  const seasonId = (season as { id?: string } | null)?.id;
  if (!seasonId) {
    return { familiesNeedingForms: 0, familiesNotified: 0, familiesSkippedRecent: 0, studentsBehind: 0 };
  }

  // Actively enrolled students, their family, and their current-season form.
  const { data: enrolled } = await db
    .from("enrollments")
    .select("student_id, students!inner(id, family_id, first_name, preferred_name)")
    .eq("status", "enrolled");
  const students = new Map<string, { familyId: string; name: string }>();
  for (const row of (enrolled ?? []) as Row[]) {
    const s = row.students as Row | null;
    const id = str(s?.id);
    const familyId = str(s?.family_id);
    if (!id || !familyId) continue;
    students.set(id, {
      familyId,
      name: str(s?.preferred_name) ?? str(s?.first_name) ?? "your child",
    });
  }
  if (students.size === 0) {
    return { familiesNeedingForms: 0, familiesNotified: 0, familiesSkippedRecent: 0, studentsBehind: 0 };
  }

  const ids = [...students.keys()];
  const signed = new Map<string, string | null>(); // student -> expires_on
  for (let i = 0; i < ids.length; i += 200) {
    const { data: forms } = await db
      .from("health_forms")
      .select("student_id, expires_on")
      .eq("season_id", seasonId)
      .not("signed_at", "is", null)
      .in("student_id", ids.slice(i, i + 200));
    for (const f of (forms ?? []) as Row[]) {
      const sid = str(f.student_id);
      if (sid) signed.set(sid, str(f.expires_on) ?? null);
    }
  }

  const today = new Date();
  const soon = new Date(today.getTime() + EXPIRY_WINDOW_DAYS * 86400_000);
  const behindByFamily = new Map<string, { names: string[]; expiring: boolean }>();
  for (const [studentId, info] of students) {
    const expiresOn = signed.get(studentId);
    const hasForm = signed.has(studentId);
    const expiringOrExpired =
      hasForm && expiresOn !== null && expiresOn !== undefined && new Date(expiresOn) <= soon;
    if (hasForm && !expiringOrExpired) continue;
    const entry = behindByFamily.get(info.familyId) ?? { names: [], expiring: false };
    if (!entry.names.includes(info.name)) entry.names.push(info.name);
    entry.expiring = entry.expiring || expiringOrExpired;
    behindByFamily.set(info.familyId, entry);
  }
  const studentsBehind = [...behindByFamily.values()].reduce((n, f) => n + f.names.length, 0);
  if (behindByFamily.size === 0) {
    return { familiesNeedingForms: 0, familiesNotified: 0, familiesSkippedRecent: 0, studentsBehind: 0 };
  }

  // Parent profiles for those families.
  const familyIds = [...behindByFamily.keys()];
  const parentsByFamily = new Map<string, string[]>();
  for (let i = 0; i < familyIds.length; i += 200) {
    const { data: parents } = await db
      .from("profiles")
      .select("id, family_id")
      .eq("role", "parent")
      .in("family_id", familyIds.slice(i, i + 200));
    for (const p of (parents ?? []) as Row[]) {
      const fid = str(p.family_id);
      const pid = str(p.id);
      if (!fid || !pid) continue;
      parentsByFamily.set(fid, [...(parentsByFamily.get(fid) ?? []), pid]);
    }
  }

  // The 7-day spacing, read from the record itself.
  const allParentIds = [...parentsByFamily.values()].flat();
  const recentlyNudged = new Set<string>();
  const since = new Date(today.getTime() - REMINDER_SPACING_DAYS * 86400_000).toISOString();
  for (let i = 0; i < allParentIds.length; i += 200) {
    const { data: recent } = await db
      .from("notifications")
      .select("user_id")
      .eq("type", "form_due")
      .eq("url", "/family/documents")
      .gte("created_at", since)
      .in("user_id", allParentIds.slice(i, i + 200));
    for (const r of (recent ?? []) as Row[]) {
      const uid = str(r.user_id);
      if (uid) recentlyNudged.add(uid);
    }
  }

  let familiesNotified = 0;
  let familiesSkippedRecent = 0;
  const rows: Row[] = [];
  for (const [familyId, entry] of behindByFamily) {
    const parents = parentsByFamily.get(familyId) ?? [];
    if (parents.length === 0) continue;
    if (parents.some((p) => recentlyNudged.has(p))) {
      familiesSkippedRecent += 1;
      continue;
    }
    const names =
      entry.names.length === 1
        ? entry.names[0]
        : entry.names.slice(0, -1).join(", ") + " and " + entry.names[entry.names.length - 1];
    for (const parentId of parents) {
      rows.push({
        user_id: parentId,
        type: "form_due",
        title: entry.expiring
          ? "A health form is about to expire"
          : `Health form needed for ${names}`,
        body: entry.expiring
          ? `${names}'s health form expires soon. Two minutes to review and re-sign — we cannot take a child into rehearsal without a current one.`
          : `We need this season's health form for ${names} before rehearsal. It takes about two minutes, and last season's answers are pre-filled where we have them.`,
        url: "/family/documents",
      });
    }
    familiesNotified += 1;
  }

  for (let i = 0; i < rows.length; i += 400) {
    const { error } = await db.from("notifications").insert(rows.slice(i, i + 400));
    if (error) throw new Error(`health-form reminders: ${error.message}`);
  }

  return {
    familiesNeedingForms: behindByFamily.size,
    familiesNotified,
    familiesSkippedRecent,
    studentsBehind,
  };
}
