import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServiceClient } from "@/lib/api/supabase/client";
import { FEE_LINE_PREFIX, type NewPerformer, type PerformanceRepo, type StudentRecord } from "./repo";
import type {
  ActPerformer,
  PerformanceAct,
  PerformanceEvent,
  RehearsalAnswer,
  SubmitResult,
} from "./types";

/**
 * Performance Events against family_hub (hub 0097), with the service role.
 *
 * Plain reads and draft writes are table calls; ownership was settled in
 * service.ts before any of them runs. Submit, withdraw and answering an
 * invitation are the database's own functions, row-locked, so the deadline,
 * the caps and the required fields are decided there whatever this process
 * believes.
 */

const BUCKET = "fh-performance";
type Row = Record<string, unknown>;

const s = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : String(v));
const n = (v: unknown) => (v === null || v === undefined || v === "" ? undefined : Number(v));

function mapEvent(r: Row, posterUrl?: string): PerformanceEvent {
  const elig = (r.performance_event_eligibility as Row[] | undefined) ?? [];
  const reh = ((r.performance_event_rehearsals as Row[] | undefined) ?? []).sort(
    (a, b) => Number(a.sort) - Number(b.sort) || String(a.on_date).localeCompare(String(b.on_date))
  );
  return {
    id: String(r.id),
    title: String(r.title),
    subtitle: s(r.subtitle),
    description: s(r.description),
    posterUrl,
    startsAt: s(r.starts_at),
    callAt: s(r.call_at),
    endsAt: s(r.ends_at),
    venueName: s(r.venue_name),
    venueAddress: s(r.venue_address),
    signupOpensAt: s(r.signup_opens_at),
    signupClosesAt: s(r.signup_closes_at),
    audience: r.audience === "chosen" ? "chosen" : "all",
    eligibleProductionIds: elig.map((e) => s(e.production_id)).filter((x): x is string => Boolean(x)),
    eligibleClassIds: elig.map((e) => s(e.class_id)).filter((x): x is string => Boolean(x)),
    minAge: n(r.min_age),
    maxAge: n(r.max_age),
    minGrade: n(r.min_grade),
    maxGrade: n(r.max_grade),
    actTypes: (r.act_types as PerformanceEvent["actTypes"]) ?? [],
    actFormats: (r.act_formats as PerformanceEvent["actFormats"]) ?? [],
    maxActs: n(r.max_acts),
    maxActsPerStudent: n(r.max_acts_per_student),
    maxMinutesPerAct: n(r.max_minutes_per_act),
    maxPerformersPerAct: n(r.max_performers_per_act),
    reqVideo: r.req_video as PerformanceEvent["reqVideo"],
    reqHeadshot: r.req_headshot as PerformanceEvent["reqHeadshot"],
    reqTrack: r.req_track as PerformanceEvent["reqTrack"],
    reqSheetMusic: r.req_sheet_music as PerformanceEvent["reqSheetMusic"],
    reqBio: r.req_bio as PerformanceEvent["reqBio"],
    bioMaxChars: Number(r.bio_max_chars ?? 400),
    selectionMode: r.selection_mode === "everyone" ? "everyone" : "review",
    allowGuests: Boolean(r.allow_guests),
    feeCents: Number(r.fee_cents ?? 0),
    termsBody: s(r.terms_body),
    alertRecipients: ((r.alert_recipients as string[] | null) ?? []).filter(Boolean),
    status: r.status as PerformanceEvent["status"],
    publishedAt: s(r.published_at),
    lineupPublishedAt: s(r.lineup_published_at),
    rehearsals: reh.map((x) => ({
      id: String(x.id),
      onDate: String(x.on_date),
      startsAt: s(x.starts_at)?.slice(0, 5),
      endsAt: s(x.ends_at)?.slice(0, 5),
      place: s(x.place),
      required: Boolean(x.required),
      notes: s(x.notes),
    })),
  };
}

function mapPerformer(r: Row): ActPerformer {
  return {
    id: String(r.id),
    kind: r.kind as ActPerformer["kind"],
    studentId: s(r.student_id),
    familyId: s(r.family_id),
    inviteEmail: s(r.invite_email),
    inviteStatus: r.invite_status as ActPerformer["inviteStatus"],
    guestName: s(r.guest_name),
    guestAge: n(r.guest_age),
    guestGuardianName: s(r.guest_guardian_name),
    guestGuardianContact: s(r.guest_guardian_contact),
    legalName: s(r.legal_name),
    preferredName: s(r.preferred_name),
    ageText: s(r.age_text),
    gradeText: s(r.grade_text),
    guardianName: s(r.guardian_name),
    guardianEmail: s(r.guardian_email),
    guardianPhone: s(r.guardian_phone),
    headshotPath: s(r.headshot_path),
    bio: s(r.bio),
    pronunciation: s(r.pronunciation),
    programName: s(r.program_name),
    sort: Number(r.sort ?? 0),
  };
}

function mapAct(r: Row): PerformanceAct {
  const performers = ((r.performance_act_performers as Row[] | undefined) ?? [])
    .map(mapPerformer)
    .sort((a, b) => a.sort - b.sort);
  const answers = ((r.performance_act_rehearsal_availability as Row[] | undefined) ?? []).map((x) => ({
    rehearsalId: String(x.rehearsal_id),
    available: Boolean(x.available),
    conflictNote: s(x.conflict_note),
  }));
  return {
    id: String(r.id),
    eventId: String(r.event_id),
    familyId: String(r.family_id),
    status: r.status as PerformanceAct["status"],
    step: Number(r.step ?? 0),
    actType: s(r.act_type) as PerformanceAct["actType"],
    actFormat: s(r.act_format) as PerformanceAct["actFormat"],
    title: s(r.title),
    source: s(r.source),
    characterName: s(r.character_name),
    runtimeSeconds: n(r.runtime_seconds),
    description: s(r.description),
    contentOk: Boolean(r.content_ok),
    videoUrl: s(r.video_url),
    trackMode: s(r.track_mode) as PerformanceAct["trackMode"],
    trackPath: s(r.track_path),
    trackFilename: s(r.track_filename),
    sheetMusicPath: s(r.sheet_music_path),
    sheetMusicFilename: s(r.sheet_music_filename),
    keyTempoNotes: s(r.key_tempo_notes),
    tech: (r.tech as PerformanceAct["tech"]) ?? {},
    familyNote: s(r.family_note),
    termsAcceptedAt: s(r.terms_accepted_at),
    termsMd5: s(r.terms_md5),
    submittedAt: s(r.submitted_at),
    statusChangedAt: s(r.status_changed_at),
    feeCents: Number(r.fee_cents ?? 0),
    feePaid: false,
    performers,
    rehearsals: answers,
    updatedAt: String(r.updated_at),
  };
}

const ACT_SELECT = "*, performance_act_performers(*), performance_act_rehearsal_availability(*)";
const EVENT_SELECT = "*, performance_event_eligibility(*), performance_event_rehearsals(*)";

/** camelCase keys from the service become snake_case columns. */
function toColumns(patch: Record<string, unknown>): Row {
  return Object.fromEntries(
    Object.entries(patch)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), v])
  );
}

export class SupabasePerformanceRepo implements PerformanceRepo {
  readonly mode = "live" as const;
  private get db(): SupabaseClient {
    return getServiceClient();
  }
  private get storageBase() {
    return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1`;
  }
  private get storageHeaders() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    return { Authorization: `Bearer ${key}`, apikey: key };
  }

  async listVisibleEvents() {
    const { data, error } = await this.db
      .from("performance_events")
      .select(EVENT_SELECT)
      .not("status", "in", "(draft,archived)")
      .not("published_at", "is", null)
      .order("starts_at", { ascending: true });
    if (error) throw new Error(`performance events lookup failed: ${error.message}`);
    const rows = (data ?? []) as Row[];
    const posters = await this.signedUrls(rows.map((r) => s(r.poster_path)).filter((p): p is string => Boolean(p)));
    return rows.map((r) => mapEvent(r, r.poster_path ? posters[String(r.poster_path)] : undefined));
  }

  async getEvent(id: string) {
    const { data, error } = await this.db
      .from("performance_events")
      .select(EVENT_SELECT)
      .eq("id", id)
      .not("status", "in", "(draft,archived)")
      .not("published_at", "is", null)
      .maybeSingle();
    if (error) throw new Error(`performance event lookup failed: ${error.message}`);
    if (!data) return null;
    const row = data as Row;
    const posters = row.poster_path ? await this.signedUrls([String(row.poster_path)]) : {};
    return mapEvent(row, row.poster_path ? posters[String(row.poster_path)] : undefined);
  }

  async getAct(id: string) {
    const { data, error } = await this.db.from("performance_acts").select(ACT_SELECT).eq("id", id).maybeSingle();
    if (error) throw new Error(`act lookup failed: ${error.message}`);
    return data ? mapAct(data as Row) : null;
  }

  async listActsForEvent(eventId: string) {
    const { data, error } = await this.db.from("performance_acts").select(ACT_SELECT).eq("event_id", eventId);
    if (error) throw new Error(`acts lookup failed: ${error.message}`);
    return ((data ?? []) as Row[]).map(mapAct);
  }

  async listActIdsForFamily(familyId: string) {
    // The database matches the family's guardian and login addresses itself.
    const { data, error } = await this.db.rpc("pe_visible_act_ids", { p_family: familyId });
    if (error) throw new Error(`visible acts lookup failed: ${error.message}`);
    return ((data ?? []) as unknown[]).map((x) => String(typeof x === "object" && x ? Object.values(x)[0] : x));
  }

  async insertAct(row: { eventId: string; familyId: string; submittedBy: string }) {
    const { data, error } = await this.db
      .from("performance_acts")
      .insert({ event_id: row.eventId, family_id: row.familyId, submitted_by: row.submittedBy })
      .select("id")
      .single();
    if (error) throw new Error(`could not start the act: ${error.message}`);
    return String((data as Row).id);
  }

  async updateAct(id: string, patch: Record<string, unknown>) {
    const { error } = await this.db.from("performance_acts").update(patch).eq("id", id);
    if (error) throw new Error(`could not save the act: ${error.message}`);
  }

  async insertPerformer(row: NewPerformer) {
    const { actId, ...rest } = row;
    const { data, error } = await this.db
      .from("performance_act_performers")
      .insert({ act_id: actId, ...toColumns(rest as Record<string, unknown>) })
      .select("id")
      .single();
    if (error) throw new Error(`could not add the performer: ${error.message}`);
    return String((data as Row).id);
  }

  async updatePerformer(id: string, patch: Record<string, unknown>) {
    const { error } = await this.db.from("performance_act_performers").update(patch).eq("id", id);
    if (error) throw new Error(`could not save the performer: ${error.message}`);
  }

  async deletePerformer(id: string) {
    const { error } = await this.db.from("performance_act_performers").delete().eq("id", id);
    if (error) throw new Error(`could not remove the performer: ${error.message}`);
  }

  async setAvailability(actId: string, answers: RehearsalAnswer[]) {
    const { error: delErr } = await this.db.from("performance_act_rehearsal_availability").delete().eq("act_id", actId);
    if (delErr) throw new Error(`could not save rehearsals: ${delErr.message}`);
    if (!answers.length) return;
    const { error } = await this.db.from("performance_act_rehearsal_availability").insert(
      answers.map((a) => ({
        act_id: actId,
        rehearsal_id: a.rehearsalId,
        available: a.available,
        conflict_note: a.conflictNote ?? null,
      }))
    );
    if (error) throw new Error(`could not save rehearsals: ${error.message}`);
  }

  async lineupSlots(eventId: string) {
    const { data: e } = await this.db
      .from("performance_events")
      .select("lineup_published_at")
      .eq("id", eventId)
      .maybeSingle();
    if (!(e as Row | null)?.lineup_published_at) return {};
    const { data } = await this.db
      .from("performance_lineup")
      .select("act_id, position, kind")
      .eq("event_id", eventId)
      .order("position");
    let slot = 0;
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as Row[]) {
      if (r.kind === "act" && r.act_id) out[String(r.act_id)] = ++slot;
    }
    return out;
  }

  async familyStudents(_actorId: string, familyId: string): Promise<StudentRecord[]> {
    const { data: students, error } = await this.db
      .from("students")
      .select("id, family_id, first_name, last_name, preferred_name, date_of_birth, grade, headshot_url")
      .eq("family_id", familyId)
      .order("date_of_birth");
    if (error) throw new Error(`students lookup failed: ${error.message}`);
    const ids = ((students ?? []) as Row[]).map((r) => String(r.id));
    const { data: enr } = ids.length
      ? await this.db
          .from("enrollments")
          .select("student_id, production_id, class_id, productions(title), classes(name)")
          .in("student_id", ids)
          .eq("status", "enrolled")
      : { data: [] };
    return ((students ?? []) as Row[]).map((r) => {
      const mine = ((enr ?? []) as Row[]).filter((e) => String(e.student_id) === String(r.id));
      return {
        id: String(r.id),
        familyId: String(r.family_id),
        firstName: String(r.first_name ?? ""),
        lastName: String(r.last_name ?? ""),
        preferredName: s(r.preferred_name),
        dateOfBirth: s(r.date_of_birth),
        grade: s(r.grade),
        headshotUrl: s(r.headshot_url),
        productionIds: mine.map((e) => s(e.production_id)).filter((x): x is string => Boolean(x)),
        classIds: mine.map((e) => s(e.class_id)).filter((x): x is string => Boolean(x)),
        enrolledIn: mine
          .map((e) => s((e.productions as Row | null)?.title) ?? s((e.classes as Row | null)?.name))
          .filter((x): x is string => Boolean(x)),
      };
    });
  }

  async familyGuardians(_actorId: string, familyId: string) {
    const { data } = await this.db
      .from("guardians")
      .select("full_name, email, phone, is_primary")
      .eq("family_id", familyId);
    return ((data ?? []) as Row[]).map((r) => ({
      fullName: String(r.full_name ?? ""),
      email: s(r.email),
      phone: s(r.phone),
      isPrimary: Boolean(r.is_primary),
    }));
  }

  async familyName(familyId: string) {
    const { data } = await this.db.from("families").select("name").eq("id", familyId).maybeSingle();
    return s((data as Row | null)?.name) ?? "Another NOVAPA family";
  }

  private verdict(data: unknown, error: { message: string } | null, what: string): SubmitResult {
    if (error) throw new Error(`${what} failed: ${error.message}`);
    const v = (data ?? {}) as { ok?: boolean; message?: string; status?: string; resubmitted?: boolean };
    return {
      ok: Boolean(v.ok),
      message: v.message,
      status: v.status as SubmitResult["status"],
      resubmitted: v.resubmitted,
    };
  }

  async submit(actId: string, familyId: string, actorId: string) {
    const { data, error } = await this.db.rpc("pe_submit_act", { p_act: actId, p_family_id: familyId, p_actor: actorId });
    return this.verdict(data, error, "submit");
  }

  async withdraw(actId: string, familyId: string) {
    const { data, error } = await this.db.rpc("pe_withdraw_act", { p_act: actId, p_family_id: familyId });
    return this.verdict(data, error, "withdraw");
  }

  async answerInvite(performerId: string, accept: boolean, studentId: string | undefined, familyId: string) {
    const { data, error } = await this.db.rpc("pe_answer_invite", {
      p_performer: performerId,
      p_accept: accept,
      p_student: studentId ?? null,
      p_family_id: familyId,
    });
    return this.verdict(data, error, "invitation answer");
  }

  async notifyInvitedAddress(email: string, title: string, body: string, url: string) {
    const address = email.toLowerCase();
    const { data: guardianRows } = await this.db.from("guardians").select("family_id").ilike("email", address);
    const familyIds = [...new Set(((guardianRows ?? []) as Row[]).map((r) => String(r.family_id)))];
    const { data: byFamily } = familyIds.length
      ? await this.db.from("profiles").select("id").in("family_id", familyIds).eq("role", "parent")
      : { data: [] };
    const { data: byEmail } = await this.db.from("profiles").select("id").ilike("email", address).eq("role", "parent");
    const ids = [...new Set([...((byFamily ?? []) as Row[]), ...((byEmail ?? []) as Row[])].map((r) => String(r.id)))];
    if (!ids.length) return; // Nobody holds it. The inviting family is never told either way.
    const { data: prefs } = await this.db.from("notification_prefs").select("user_id, enabled").in("user_id", ids);
    const allowed = ids.filter((id) => {
      const p = ((prefs ?? []) as Row[]).find((x) => String(x.user_id) === id);
      return ((p?.enabled ?? {}) as Record<string, boolean>).announcement !== false;
    });
    if (allowed.length) {
      await this.db.from("notifications").insert(allowed.map((user_id) => ({ user_id, type: "announcement", title, body, url })));
    }
  }

  async storeDataUrl(path: string, dataUrl: string) {
    const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
    if (!match) throw new Error("Expected an image.");
    await this.putObject(path, match[1], Buffer.from(match[2], "base64"));
    return path;
  }

  private async putObject(path: string, contentType: string, bytes: Uint8Array) {
    const res = await fetch(`${this.storageBase}/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...this.storageHeaders, "Content-Type": contentType, "x-upsert": "true" },
      body: bytes as unknown as BodyInit,
    });
    if (!res.ok) throw new Error(`Storage upload failed (${res.status}): ${await res.text()}`);
  }

  async copyStudentHeadshot(headshotUrl: string, path: string) {
    // A student headshot is a storage address on this project; read it with
    // the service key whatever bucket it sits in. Anything else, leave.
    if (!headshotUrl.startsWith(this.storageBase)) return null;
    const res = await fetch(headshotUrl.replace("/object/public/", "/object/"), { headers: this.storageHeaders });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return null;
    await this.putObject(path, type, new Uint8Array(await res.arrayBuffer()));
    return path;
  }

  async signUpload(path: string) {
    const res = await fetch(`${this.storageBase}/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...this.storageHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ upsert: true }),
    });
    if (!res.ok) throw new Error(`Could not prepare the upload (${res.status}): ${await res.text()}`);
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error("Storage did not return an upload URL.");
    return { uploadUrl: `${this.storageBase}${data.url.startsWith("/") ? "" : "/"}${data.url}`, path };
  }

  async signedUrls(paths: string[]) {
    const unique = [...new Set(paths.filter(Boolean))];
    if (!unique.length) return {};
    const res = await fetch(`${this.storageBase}/object/sign/${BUCKET}`, {
      method: "POST",
      headers: { ...this.storageHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600, paths: unique }),
    });
    if (!res.ok) return {};
    const rows = (await res.json()) as Array<{ path: string | null; signedURL: string | null }>;
    return Object.fromEntries(
      rows
        .filter((r) => r.path && r.signedURL)
        .map((r) => [r.path!, `${this.storageBase}${r.signedURL!.startsWith("/") ? "" : "/"}${r.signedURL}`])
    );
  }

  async feeProductId(eventId: string) {
    const { data } = await this.db
      .from("products")
      .select("id")
      .eq("is_active", true)
      .eq("config->>performanceEventId", eventId)
      .limit(1)
      .maybeSingle();
    return s((data as Row | null)?.id);
  }

  async paidActIds(actIds: string[]) {
    if (!actIds.length) return new Set<string>();
    const notes = actIds.map((id) => `${FEE_LINE_PREFIX}${id}`);
    const { data } = await this.db
      .from("button_order_items")
      .select("customization, button_orders!inner(paid_at)")
      .in("customization->>note", notes)
      .not("button_orders.paid_at", "is", null);
    return new Set(
      ((data ?? []) as Row[])
        .map((r) => String((r.customization as Row | null)?.note ?? "").slice(FEE_LINE_PREFIX.length))
        .filter(Boolean)
    );
  }
}
