import "server-only";
import { getProvider } from "@/lib/api";
import { getServiceClient, isSupabaseConfigured } from "@/lib/api/supabase/client";
import type { FeedAudience, SessionUser } from "@/lib/api/types";
import { logActivity } from "@/lib/activity";
import { hasRoleAtLeast } from "@/lib/auth/session";
import { isEveryone, parentsInAudience, type AudienceTables } from "@/lib/notifications/audience-parents";
import { drainPushQueueUntilDone } from "@/lib/push/queue";

/**
 * A push notification to parents — the one send behind both doors: the
 * hub's own /admin/push and the staff portal's "Push to parents" page (via
 * /api/push/broadcast, CJ 9 Oct 2026: "I want to push the notification from
 * the staff portal to the parent portal").
 *
 * Who it goes to (CJ, 10 Oct 2026: "allow us to aggregate families based on
 * their enrollment before we push something to them"): every parent, or the
 * families enrolled in any of the shows, classes, or programs picked. The
 * picks are a union, and the rule is the same one feed posts and Email
 * families use (lib/notifications/audience-parents.ts).
 *
 * Push here is never a separate channel: the send writes one notification
 * row per parent (the bell, for everyone) and then drains the push outbox
 * straight away, so every device that turned push on rings now rather than
 * at the next 5-minute tick. Per-type opt-outs and quiet hours still hold —
 * a family that switched announcements off asked not to be told.
 *
 * Admins only: a send that reaches every family is not a staff-level button.
 * Callers check the role; this re-checks it so neither door can forget.
 */

export const TITLE_MAX = 80;
export const BODY_MAX = 300;

/** Shows, classes, and programs to send to. Empty = every parent. */
export type PushAudience = Pick<FeedAudience, "productionIds" | "classIds" | "programIds">;

export type PushBroadcastInput = {
  title: string;
  body: string;
  url?: string;
  urgent?: boolean;
  audience?: PushAudience;
};

export type PushBroadcastResult =
  | { ok: true; recipients: number; rang: number; held: number; message: string }
  | { ok: false; message?: string; errors?: { title?: string; body?: string; url?: string; audience?: string } };

export type PushReach = { parents: number; devices: number; parentsWithPush: number };

/** One thing a family can be enrolled in, with how many families are in it now. */
export type PushAudienceOption = {
  id: string;
  name: string;
  families: number;
  /** Productions only: the run's dates, when the hub knows them. */
  opensOn?: string | null;
  closesOn?: string | null;
  /** Closed before today — listed last, still pickable. */
  past?: boolean;
};

export type PushAudienceOptions = {
  programs: PushAudienceOption[];
  productions: PushAudienceOption[];
  classes: PushAudienceOption[];
};

function live(): boolean {
  return (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") === "supabase" && isSupabaseConfigured();
}

type Row = Record<string, unknown>;

/** PostgREST stops at 1000 rows without saying so; students are at 975. */
async function readAll(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>
): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) return all;
  }
}

async function enrollmentTables() {
  const db = getServiceClient();
  const [students, enrollments, { data: classes }, { data: productions }, { data: programs }] =
    await Promise.all([
      readAll((from, to) => db.from("students").select("id, family_id").order("id").range(from, to)),
      readAll((from, to) =>
        db.from("enrollments").select("student_id, production_id, class_id")
          .eq("status", "enrolled").order("id").range(from, to)
      ),
      db.from("classes").select("id, name, program_id"),
      db.from("productions").select("id, title, program_id, opens_on, closes_on"),
      db.from("programs").select("id, name"),
    ]);
  return {
    tables: {
      students: students as AudienceTables["students"],
      enrollments: enrollments as AudienceTables["enrollments"],
      classes: (classes ?? []) as AudienceTables["classes"],
      productions: (productions ?? []) as AudienceTables["productions"],
    } satisfies AudienceTables,
    classes: (classes ?? []) as Array<{ id: string; name: string | null; program_id: string | null }>,
    productions: (productions ?? []) as Array<{
      id: string; title: string | null; program_id: string | null;
      opens_on: string | null; closes_on: string | null;
    }>,
    programs: (programs ?? []) as Array<{ id: string; name: string | null }>,
  };
}

function audienceEmpty(audience?: PushAudience): boolean {
  return !audience || isEveryone(audience);
}

/**
 * The two honest numbers: every parent in the audience sees the notice in
 * their bell, but only parents who turned push on for a device get a phone
 * that rings. Saying "sent to 823" and nothing else would let CJ believe 823
 * phones lit up.
 */
export async function pushReach(audience?: PushAudience): Promise<PushReach | null> {
  if (!live()) return null;
  const db = getServiceClient();
  const [parents, { data: subs }] = await Promise.all([
    readAll((from, to) =>
      db.from("profiles").select("id, family_id").eq("role", "parent").order("id").range(from, to)
    ),
    db.from("push_subscriptions").select("user_id"),
  ]);
  let chosen = parents as Array<{ id: string; family_id: string | null }>;
  if (!audienceEmpty(audience)) {
    chosen = parentsInAudience(audience!, chosen, (await enrollmentTables()).tables);
  }
  const parentIds = new Set(chosen.map((p) => String(p.id)));
  const parentSubs = (subs ?? []).filter((s: { user_id: string }) => parentIds.has(String(s.user_id)));
  return {
    parents: parentIds.size,
    devices: parentSubs.length,
    parentsWithPush: new Set(parentSubs.map((s: { user_id: string }) => s.user_id)).size,
  };
}

/**
 * What the composer offers to send to: every program, show, and class that
 * has at least one family enrolled right now, with the family count. A show
 * with nobody enrolled has nobody to tell, so it is not listed.
 *
 * Order: shows still to come or running first (by opening date), then the
 * undated ones (the hub has no dates for most summer and conservatory
 * shows), then shows that closed before today.
 */
export async function pushAudienceOptions(): Promise<PushAudienceOptions | null> {
  if (!live()) return null;
  const { tables, classes, productions, programs } = await enrollmentTables();

  const familyOf = new Map(tables.students.map((s) => [String(s.id), s.family_id]));
  const byProduction = new Map<string, Set<string>>();
  const byClass = new Map<string, Set<string>>();
  const byProgram = new Map<string, Set<string>>();
  const classProgram = new Map(classes.map((c) => [String(c.id), c.program_id]));
  const productionProgram = new Map(productions.map((p) => [String(p.id), p.program_id]));
  const add = (map: Map<string, Set<string>>, key: string | null | undefined, family: string) => {
    if (!key) return;
    const set = map.get(String(key)) ?? new Set<string>();
    set.add(family);
    map.set(String(key), set);
  };
  for (const e of tables.enrollments) {
    const family = familyOf.get(String(e.student_id));
    if (!family) continue;
    add(byClass, e.class_id, String(family));
    add(byProduction, e.production_id, String(family));
    // Same program rule as the send: a class enrollment counts under its class.
    add(byProgram, e.class_id
      ? classProgram.get(String(e.class_id))
      : e.production_id ? productionProgram.get(String(e.production_id)) : null, String(family));
  }

  // Today in Eastern time, as YYYY-MM-DD, to compare with the run's dates.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const name = (s: string | null | undefined) => (s ?? "").trim() || "Untitled";
  const rank = (o: PushAudienceOption) => (o.past ? 2 : o.opensOn ? 0 : 1);

  return {
    programs: programs
      .filter((p) => byProgram.has(String(p.id)))
      .map((p) => ({ id: String(p.id), name: name(p.name), families: byProgram.get(String(p.id))!.size }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    productions: productions
      .filter((p) => byProduction.has(String(p.id)))
      .map((p) => ({
        id: String(p.id),
        name: name(p.title),
        families: byProduction.get(String(p.id))!.size,
        opensOn: p.opens_on,
        closesOn: p.closes_on,
        past: Boolean(p.closes_on && p.closes_on < today),
      }))
      .sort((a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 0 ? String(a.opensOn).localeCompare(String(b.opensOn)) : 0) ||
        (rank(a) === 2 ? String(b.closesOn).localeCompare(String(a.closesOn)) : 0) ||
        a.name.localeCompare(b.name)
      ),
    classes: classes
      .filter((c) => byClass.has(String(c.id)))
      .map((c) => ({ id: String(c.id), name: name(c.name), families: byClass.get(String(c.id))!.size }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Ids only, deduplicated, capped — this arrives from a browser. */
export function cleanAudience(raw: unknown): PushAudience {
  const ids = (value: unknown) =>
    Array.isArray(value)
      ? [...new Set(value.filter((v): v is string => typeof v === "string" && /^[\w-]{1,64}$/.test(v)))].slice(0, 200)
      : [];
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const audience: PushAudience = {};
  const productionIds = ids(input.productionIds);
  const classIds = ids(input.classIds);
  const programIds = ids(input.programIds);
  if (productionIds.length) audience.productionIds = productionIds;
  if (classIds.length) audience.classIds = classIds;
  if (programIds.length) audience.programIds = programIds;
  return audience;
}

/** "Frozen, Jr. + 2 more" — for the activity log and the result line. */
async function describeAudience(audience: PushAudience): Promise<string> {
  const options = await pushAudienceOptions().catch(() => null);
  const names: string[] = [];
  const pick = (list: PushAudienceOption[] | undefined, ids: string[] | undefined) => {
    for (const id of ids ?? []) names.push(list?.find((o) => o.id === id)?.name ?? "a group");
  };
  pick(options?.programs, audience.programIds);
  pick(options?.productions, audience.productionIds);
  pick(options?.classes, audience.classIds);
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} + ${names.length - 1} more`;
}

export async function broadcastPushToAllParents(
  user: SessionUser,
  input: PushBroadcastInput
): Promise<PushBroadcastResult> {
  if (!hasRoleAtLeast(user, "admin")) {
    return { ok: false, message: "Only an admin can send to every family." };
  }

  const title = (input.title ?? "").trim();
  const body = (input.body ?? "").trim();
  const url = (input.url ?? "").trim();
  const urgent = input.urgent === true;
  const audience = cleanAudience(input.audience);
  const everyone = audienceEmpty(audience);

  const errors: { title?: string; body?: string; url?: string } = {};
  if (!title) errors.title = "Give it a title.";
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if (!body) errors.body = "Say what you want families to know.";
  else if (body.length > BODY_MAX) errors.body = `Keep it under ${BODY_MAX} characters - phones cut the rest.`;
  // A portal page only; a push that opens some other site reads as spam.
  if (url && !/^\/[^/]/.test(url) && url !== "/") {
    errors.url = "Use a portal page, like /schedule or /feed.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  /* broadcast is the dashboard's red band — closures and cancellations
     only (types.ts). Everything else is an announcement. */
  const { recipients } = await getProvider().broadcastNotification(user.id, {
    type: urgent ? "broadcast" : "announcement",
    title,
    body,
    url: url || undefined,
    audience,
  });

  let rang = 0;
  let held = 0;
  if (recipients > 0) {
    try {
      const drained = await drainPushQueueUntilDone();
      rang = drained.sent;
      held = drained.deferred;
    } catch (err) {
      // The rows are written; the 5-minute cron will ring whatever this missed.
      console.error("push broadcast drain failed", err);
    }
  }

  const group = everyone ? null : await describeAudience(audience);
  await logActivity({
    user,
    action: "push.broadcast",
    summary: `Sent "${title}" to ${recipients} parents${group ? ` of ${group}` : ""}${urgent ? " (urgent)" : ""}`,
  });

  const parts = [`Sent to ${recipients} parents' notification bells.`];
  parts.push(`${rang} ${rang === 1 ? "phone or computer" : "phones and computers"} rang.`);
  if (held) parts.push(`${held} held for quiet hours - they ring in the morning.`);
  return { ok: true, recipients, rang, held, message: parts.join(" ") };
}
