/**
 * Integration smoke test for the SupabaseDataProvider's ported slice,
 * run against the seeded shared database with REAL ids.
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/adapter-smoke.ts
 */
import { createSupabaseProvider } from "../src/lib/api/supabase/provider";
import { AccessDeniedError } from "../src/lib/api/provider";

const results: Array<[string, boolean, string?]> = [];
const check = (name: string, ok: boolean, detail?: string) => {
  results.push([name, ok, detail]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function main() {
  const p = createSupabaseProvider();

  const sofia = await p.getUserByEmail("sofia@example.com");
  check("getUserByEmail resolves parent", Boolean(sofia?.familyId), sofia?.displayName);
  const dana = await p.getUserByEmail("dana@example.com");
  check("staff user resolves with role", dana?.role === "admin" || dana?.role === "staff" || dana?.role === "super_admin", dana?.role);
  const minh = await p.getUserByEmail("minh@example.com");

  if (!sofia?.familyId || !dana || !minh) throw new Error("seed users missing");

  const students = await p.getStudentsForFamily(sofia.id, sofia.familyId);
  check(
    "parent reads own students",
    students.length === 2 && students.every((s) => ["Ava", "Leo"].includes(s.firstName)),
    students.map((s) => s.firstName).join(", ")
  );

  let denied = false;
  try {
    await p.getStudentsForFamily(minh.id, sofia.familyId);
  } catch (error) {
    denied = error instanceof AccessDeniedError;
  }
  check("another parent is denied that family", denied);

  const family = await p.getFamily(sofia.id, sofia.familyId);
  check(
    "parent family read hides staff notes",
    Boolean(family) && family!.staffNotes === undefined,
    family?.name
  );

  const staffFamilyView = await p.getFamily(dana.id, sofia.familyId);
  check("staff can read the family", Boolean(staffFamilyView));

  const staff = await p.getStaffProfiles();
  check("staff directory reads", staff.length === 4, `${staff.length} profiles`);

  const notifications = await p.getNotifications(sofia.id);
  check("notifications read (empty ok)", Array.isArray(notifications), `${notifications.length}`);

  // Calendar: Martinez family (Ava = Elsa, Leo = Snow Chorus) should see
  // the scene-tagged 'Let It Go' rehearsal but NOT the Anna/Hans duet.
  const cal = await p.getFamilyCalendar(sofia.id, sofia.familyId);
  check("family calendar returns events", cal.length > 0, `${cal.length} events`);
  const letItGo = cal.find((e) => e.title.includes("Let It Go"));
  const duet = cal.find((e) => e.title.includes("Open Door"));
  check("scene-tagged rehearsal included for called roles", Boolean(letItGo));
  // Ava holds Young Elsa (published) → not called for the Anna/Hans duet.
  // Leo's seeded name matches no role, so the pre-publication fallback may
  // keep it visible for him — identical rule to the mock provider.
  const ava = students.find((st) => st.firstName === "Ava")!;
  check(
    "student with a published role excluded from uncalled scenes",
    !duet || !duet.studentIds.includes(ava.id)
  );

  const master = await p.getAllEvents(dana.id);
  check("staff master schedule reads", master.length >= 5, `${master.length} events`);

  /* ── casting slice ── */
  const { createClient } = await import("@supabase/supabase-js");
  const raw = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: frozen } = await raw
    .from("productions").select("id").eq("title", "Frozen Jr.").single();
  const frozenId = String(frozen!.id);

  const roles = await p.getShowRoles(frozenId);
  check("show roles read", roles.length === 25, `${roles.length} roles`);
  const scenes = await p.getShowScenes(frozenId);
  check("show scenes read", scenes.length === 16, `${scenes.length} scenes`);

  // Ava holds Young Elsa (published): in the Snowman number, not the duet.
  const breakdown = await p.getStudentSceneBreakdown(sofia.id, ava.id, frozenId);
  check(
    "scene breakdown for published role",
    breakdown.some((r) => r.scene.name.includes("Snowman")) &&
      !breakdown.some((r) => r.scene.name.includes("Open Door")),
    `${breakdown.length} scenes as ${breakdown[0]?.roleName}`
  );

  let breakdownDenied = false;
  try {
    await p.getStudentSceneBreakdown(minh.id, ava.id, frozenId);
  } catch (error) {
    breakdownDenied = error instanceof AccessDeniedError;
  }
  check("another family denied the breakdown", breakdownDenied);

  // Round-trip a confirmation: fixture insert → family responds with a
  // playbill correction → admins notified → fixture cleaned up.
  const { data: avaAssignment } = await raw
    .from("casting_assignments").select("id")
    .eq("student_id", ava.id).eq("production_id", frozenId).single();
  const { data: fixture } = await raw
    .from("casting_confirmations")
    .insert({
      assignment_id: avaAssignment!.id,
      student_id: ava.id,
      family_id: sofia.familyId,
      reminder_count: 0,
    })
    .select().single();

  const mine = await p.getMyCastingConfirmations(sofia.id);
  check(
    "family sees own confirmation with role name",
    mine.length === 1 && mine[0].roleName === "Young Elsa",
    mine[0]?.roleName
  );

  const responded = await p.respondToCasting(sofia.id, String(fixture!.id), {
    nameCorrect: false,
    playbillName: "Ava Grace Martinez",
  });
  check(
    "playbill correction saved verbatim",
    responded.nameCorrect === false && responded.playbillName === "Ava Grace Martinez"
  );

  let respondDenied = false;
  try {
    await p.respondToCasting(minh.id, String(fixture!.id), { nameCorrect: true });
  } catch (error) {
    respondDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot respond to it", respondDenied);

  const adminNotes = await p.getNotifications(dana.id);
  check(
    "admin notified of the correction",
    adminNotes.some((n) => n.title === "Playbill name correction")
  );

  // Clean up fixture rows so re-runs stay deterministic.
  await raw.from("casting_confirmations").delete().eq("id", fixture!.id);
  await raw.from("notifications").delete().eq("title", "Playbill name correction");

  /* ── lessons slice ── */
  const slotsBefore = await p.getLessonSlots(sofia.id);
  check(
    "lesson slots read, all open",
    slotsBefore.length === 9 && slotsBefore.every((r) => r.status === "open"),
    `${slotsBefore.length} slots`
  );

  const marcusSlot = slotsBefore.find(
    (r) => r.teacherName === "Marcus Lee" && r.slot.weekday === 2 && r.slot.startTime === "16:30"
  )!;
  const booking = await p.bookLessonSlot(sofia.id, {
    slotId: marcusSlot.slot.id,
    studentId: ava.id,
    goals: "Belting for the spring show",
  });
  check("weekly slot booked", booking.status === "active", booking.startDate);

  let doubleBooked = false;
  try {
    await p.bookLessonSlot(minh.id, { slotId: marcusSlot.slot.id, studentId: students[0].id });
  } catch {
    doubleBooked = true;
  }
  // (minh booking sofia's child would also throw — use his own child below)
  const lien = await raw.from("students").select("id").eq("first_name", "Liên").single();
  let takenRejected = false;
  try {
    await p.bookLessonSlot(minh.id, { slotId: marcusSlot.slot.id, studentId: String(lien.data!.id) });
  } catch (error) {
    takenRejected = String(error).includes("taken");
  }
  check("taken slot cannot be double-booked", doubleBooked && takenRejected);

  const forMinh = (await p.getLessonSlots(minh.id)).find((r) => r.slot.id === marcusSlot.slot.id)!;
  check(
    "other family sees 'taken', never the name",
    forMinh.status === "taken" && !forMinh.studentName && !forMinh.bookingId
  );
  const forSofia = (await p.getLessonSlots(sofia.id)).find((r) => r.slot.id === marcusSlot.slot.id)!;
  check("owner sees 'yours' with the name", forSofia.status === "yours" && forSofia.studentName?.includes("Ava") === true);

  const myBookings = await p.getMyLessonBookings(sofia.id);
  check(
    "family bookings list with next lesson",
    myBookings.length === 1 && myBookings[0].teacherName === "Marcus Lee" &&
      new Date(myBookings[0].nextLessonAt).getTime() > Date.now() - 1000
  );

  const calWithLesson = await p.getFamilyCalendar(sofia.id, sofia.familyId);
  check(
    "lesson occurrences on the family calendar",
    calWithLesson.filter((e) => e.title.includes("Voice lesson — Marcus Lee")).length >= 4
  );

  const roster = await p.getLessonRoster(dana.id);
  const rosterRow = roster.find((r) => r.slot.id === marcusSlot.slot.id)!;
  check(
    "staff roster shows student, family, goals",
    rosterRow.studentName?.includes("Ava") === true &&
      rosterRow.familyName === "The Martinez Family" &&
      rosterRow.goals === "Belting for the spring show"
  );
  let rosterDenied = false;
  try {
    await p.getLessonRoster(sofia.id);
  } catch (error) {
    rosterDenied = error instanceof AccessDeniedError;
  }
  check("roster is staff-only", rosterDenied);

  let cancelDenied = false;
  try {
    await p.cancelLessonBooking(minh.id, booking.id);
  } catch (error) {
    cancelDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot cancel the booking", cancelDenied);

  await p.cancelLessonBooking(sofia.id, booking.id);
  const freed = (await p.getLessonSlots(minh.id)).find((r) => r.slot.id === marcusSlot.slot.id)!;
  check("cancel frees the slot", freed.status === "open");

  // Clean up fixtures so re-runs stay deterministic.
  await raw.from("lesson_bookings").delete().eq("id", booking.id);
  await raw.from("notifications").delete().in("title", [
    "Weekly voice lesson booked 🎉", "New weekly lesson student", "Weekly lesson cancelled",
  ]);

  /* ── audition profiles & rubric evaluations ── */
  const profile = await p.submitAuditionProfile(sofia.id, {
    studentId: ava.id,
    productionId: frozenId,
    preferenceTier: "lead",
    previousRoles: "Young Anna (2025)",
    hopes: "A named role this year",
    acknowledgedNoGuarantee: true,
  });
  check(
    "audition profile submitted by parent",
    profile.preferenceTier === "lead" && profile.submittedByRole === "parent"
  );

  let profileDenied = false;
  try {
    await p.submitAuditionProfile(minh.id, {
      studentId: ava.id, productionId: frozenId, preferenceTier: "ensemble",
      previousRoles: "", hopes: "", acknowledgedNoGuarantee: true,
    });
  } catch (error) {
    profileDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot submit her profile", profileDenied);

  const vocalScores = {
    pitch_intonation: 2, breath_tone: 3, rhythm_musicality: 3,
    range_comfort: 2, lyric_diction: 3, song_acting: 2,
  };
  const evaluation = await p.submitEvaluation(dana.id, {
    studentId: ava.id, productionId: frozenId, discipline: "vocal",
    scores: vocalScores, notes: "Lovely tone, needs breath support.",
    callbackNotes: "Consider for Young Elsa", growthNotes: "Weekly voice lessons",
  });
  check("rubric evaluation saved", evaluation.evaluatorName === "Dana Whitfield");

  let badScores = false;
  try {
    await p.submitEvaluation(dana.id, {
      studentId: ava.id, productionId: frozenId, discipline: "acting",
      scores: { diction_projection: 9 }, notes: "", callbackNotes: "",
    });
  } catch (error) {
    badScores = String(error).includes("1–5");
  }
  check("incomplete/out-of-range scores rejected", badScores);

  const auditionRoster = await p.getAuditionRoster(dana.id, frozenId);
  const avaRow = auditionRoster.find((r) => r.student.id === ava.id)!;
  check(
    "audition roster joins profile + evaluations",
    auditionRoster.length === 4 && avaRow.profile?.preferenceTier === "lead" &&
      avaRow.evaluations.length === 1
  );

  const recs = await p.getGrowthRecommendations(sofia.id, ava.id, frozenId);
  check(
    "low vocal average triggers a growth recommendation",
    recs.length === 1 && recs[0].discipline === "vocal"
  );

  /* ── staff casting board (DESTRUCTIVE: re-run seed-supabase.ts after) ── */
  let boardDenied = false;
  try {
    await p.getCastingBoard(sofia.id, frozenId);
  } catch (error) {
    boardDenied = error instanceof AccessDeniedError;
  }
  check("casting board is staff-only", boardDenied);

  const board0 = await p.getCastingBoard(dana.id, frozenId);
  check(
    "board opens with all registered unassigned",
    board0.board.status === "drafting" && board0.unassigned.length === 4 &&
      board0.roles.length === 25
  );

  const roleId = (name: string) => board0.roles.find((r) => r.name === name)!.id;
  await p.assignRole(dana.id, frozenId, roleId("Elsa"), ava.id);
  await p.assignRole(dana.id, frozenId, roleId("Anna"), ava.id);
  let board1 = await p.getCastingBoard(dana.id, frozenId);
  check(
    "a student holds exactly one role (assign moves them)",
    board1.board.entries.length === 1 &&
      board1.board.entries[0].roleId === roleId("Anna")
  );

  const lienId = String(lien.data!.id);
  await p.assignRole(dana.id, frozenId, roleId("Anna"), lienId);
  board1 = await p.getCastingBoard(dana.id, frozenId);
  check(
    "named role capacity 1: new occupant bumps the old one out",
    board1.board.entries.length === 1 &&
      board1.board.entries[0].studentId === lienId &&
      board1.unassigned.some((st) => st.id === ava.id)
  );

  let incomplete = false;
  try {
    await p.submitCasting(dana.id, frozenId);
  } catch (error) {
    incomplete = String(error).includes("Every student");
  }
  check("submit blocked until every student has a role", incomplete);

  const chidi = await raw.from("students").select("id").eq("first_name", "Chidi").single();
  const leo = students.find((st) => st.firstName === "Leo")!;
  await p.assignRole(dana.id, frozenId, roleId("Elsa"), ava.id);
  await p.assignRole(dana.id, frozenId, roleId("Kristoff"), String(chidi.data!.id));
  await p.assignRole(dana.id, frozenId, roleId("Snow Chorus"), leo.id);
  const submitted = await p.submitCasting(dana.id, frozenId);
  check(
    "submit creates 4 assignments, notifies 3 families",
    submitted.assignmentsCreated === 4 && submitted.familiesNotified === 3,
    JSON.stringify(submitted)
  );

  const afterSubmit = await p.getMyCastingConfirmations(sofia.id);
  check(
    "family gets confirmations for BOTH their children only",
    afterSubmit.length === 2 &&
      afterSubmit.every((c) => ["Elsa", "Snow Chorus"].includes(c.roleName))
  );
  const sofiaNotes = await p.getNotifications(sofia.id);
  check(
    "per-family casting notification arrived",
    sofiaNotes.some((n) => n.title.includes("Casting for Frozen Jr."))
  );

  let locked = false;
  try {
    await p.assignRole(dana.id, frozenId, roleId("Elsa"), ava.id);
  } catch (error) {
    locked = String(error).includes("already been submitted");
  }
  check("board locked after submit", locked);

  /* ── understudies (board is submitted at this point) ── */
  let notLead = false;
  try {
    await p.assignUnderstudy(dana.id, frozenId, roleId("Snow Chorus"), ava.id);
  } catch (error) {
    notLead = String(error).includes("lead roles only");
  }
  check("understudies are lead-roles-only", notLead);

  let selfCover = false;
  try {
    await p.assignUnderstudy(dana.id, frozenId, roleId("Elsa"), ava.id);
  } catch (error) {
    selfCover = String(error).includes("already play this role");
  }
  check("a student can't understudy their own role", selfCover);

  const holes0 = await p.getUnderstudyHoles(dana.id, frozenId);
  check("all 5 leads start as holes", holes0.length === 5);

  await p.assignUnderstudy(dana.id, frozenId, roleId("Anna"), leo.id);
  const holes1 = await p.getUnderstudyHoles(dana.id, frozenId);
  check(
    "covering Anna leaves 4 holes",
    holes1.length === 4 && !holes1.some((r) => r.name === "Anna")
  );

  const pub = await p.publishUnderstudies(dana.id, frozenId);
  check(
    "publish reports 1 published, 4 holes",
    pub.published === 1 && pub.holes === 4,
    JSON.stringify(pub)
  );
  const afterUs = await p.getMyCastingConfirmations(sofia.id);
  check(
    "understudy confirmation reaches only Leo's family",
    afterUs.some((c) => c.roleName === "Anna (Understudy)")
  );
  const usNotes = await p.getNotifications(sofia.id);
  check(
    "understudy notification says 'will understudy'",
    usNotes.some((n) => n.body.includes("will understudy: Anna"))
  );

  /* ── cast-list pills & responses ── */
  const pills = await p.getCastListStatus(dana.id, frozenId);
  const annaPill = pills.find((row) => row.role.name === "Anna")!;
  check(
    "Anna pill: filled (unresponded), principal + u/s holders",
    annaPill.status === "filled" &&
      annaPill.holders.some((h) => h.isUnderstudy) &&
      annaPill.holders.some((h) => !h.isUnderstudy)
  );
  check(
    "uncast roles read open",
    pills.find((row) => row.role.name === "Olaf")!.status === "open"
  );

  // Family accepts Elsa → pill flips to accepted (u/s never gates).
  const elsaConf = (await p.getMyCastingConfirmations(sofia.id)).find(
    (c) => c.roleName === "Elsa"
  )!;
  await p.respondToCasting(sofia.id, elsaConf.confirmation.id, { nameCorrect: true });
  const pills2 = await p.getCastListStatus(dana.id, frozenId);
  check(
    "accepted pill after family confirms",
    pills2.find((row) => row.role.name === "Elsa")!.status === "accepted"
  );

  const responses = await p.getCastingResponses(dana.id, frozenId);
  check(
    "staff responses view lists all confirmations",
    responses.length === 5 &&
      responses.some((r) => r.roleName === "Anna (Understudy)")
  );

  /* ── feedback release (uses the submitted board's confirmations) ── */
  const elsaConf2 = (await p.getMyCastingConfirmations(sofia.id)).find(
    (c) => c.roleName === "Elsa"
  )!;
  const released = await p.requestAuditionFeedback(sofia.id, elsaConf2.confirmation.id);
  check(
    "feedback release strips callback notes, keeps growth notes",
    released.length === 1 && released[0].callbackNotes === "" &&
      released[0].growthNotes === "Weekly voice lessons" &&
      released[0].notes.includes("breath support")
  );
  let feedbackDenied = false;
  try {
    await p.requestAuditionFeedback(minh.id, elsaConf2.confirmation.id);
  } catch (error) {
    feedbackDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot request her feedback", feedbackDenied);

  /* ── background jobs ── */
  // 4 confirmations are still unanswered (Elsa was accepted above).
  const remind1 = await p.remindPendingCastingConfirmations(dana.id, { olderThanMs: 0 });
  check("12h reminder sweeps all unanswered confirmations", remind1.reminded === 4, `${remind1.reminded}`);
  check(
    "reminder notification reached the family",
    (await p.getNotifications(sofia.id)).some(
      (n) => n.title === "Reminder: confirm the playbill name"
    )
  );
  const remind2 = await p.remindPendingCastingConfirmations(dana.id);
  check("just-reminded confirmations are skipped", remind2.reminded === 0);

  // Rehearsal notices around the seeded 'Let It Go' rehearsal (Elsa + Snow
  // Chorus): Martinez is called (Ava & Leo), Nguyen is not.
  const notices1 = await p.runRehearsalNotices(dana.id, { now: "2026-07-29T10:00:00.000Z" });
  check("rehearsal reminders sent", notices1.reminders >= 1, JSON.stringify(notices1));
  const sofiaRehearsal = (await p.getNotifications(sofia.id)).find(
    (n) => n.title.startsWith("Tomorrow:") && n.title.includes("Let It Go")
  );
  check(
    "called family reminded with both kids' names",
    Boolean(sofiaRehearsal) && sofiaRehearsal!.body.includes("Ava & Leo")
  );
  check(
    "uncalled family not reminded",
    !(await p.getNotifications(minh.id)).some(
      (n) => n.title.startsWith("Tomorrow:") && n.title.includes("Let It Go")
    )
  );
  const notices2 = await p.runRehearsalNotices(dana.id, { now: "2026-07-29T11:00:00.000Z" });
  check("rehearsal notices deduped on re-run", notices2.reminders === 0);
  const notices3 = await p.runRehearsalNotices(dana.id, { now: "2026-07-30T10:00:00.000Z" });
  check("post-rehearsal thank-you sent", notices3.thanks >= 1, JSON.stringify(notices3));

  /* ── direct messages ── */
  const thread = await p.startMessageThread(sofia.id, {
    recipientRole: "health_safety",
    subject: "Ava's tree nut allergy",
    body: "Please make sure snack table is nut-free during tech week.",
    studentId: ava.id,
  });
  check("family starts an H&S thread about their child", thread.status === "open");

  const jo = await p.getUserByEmail("jo@example.com");
  const marcus = await p.getUserByEmail("marcus@example.com");
  const joInbox = await p.getStaffInbox(jo!.id);
  check(
    "H&S director sees the thread with family + student names",
    joInbox.length === 1 && joInbox[0].familyName === "The Martinez Family" &&
      joInbox[0].studentName?.includes("Ava") === true
  );
  const marcusInbox = await p.getStaffInbox(marcus!.id);
  check("non-H&S staff does NOT see health threads", marcusInbox.length === 0);

  await p.replyToThread(jo!.id, thread.id, "Absolutely — flagged for the tech-week team.");
  const sofiaUnread = await p.getUnreadMessageCount(sofia.id);
  check("family unread count reflects the staff reply", sofiaUnread === 1);
  await p.markThreadRead(sofia.id, thread.id);
  check("mark-read zeroes the count", (await p.getUnreadMessageCount(sofia.id)) === 0);

  let threadDenied = false;
  try {
    await p.getThread(minh.id, thread.id);
  } catch (error) {
    threadDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot open the thread", threadDenied);

  const closed = await p.setThreadStatus(dana.id, thread.id, "closed");
  await p.replyToThread(sofia.id, thread.id, "Thank you!");
  const reopened = await p.getThread(sofia.id, thread.id);
  check(
    "family reply reopens a closed thread",
    closed.status === "closed" && reopened?.thread.status === "open"
  );

  // Clean up message fixtures.
  await raw.from("message_threads").delete().eq("id", thread.id);

  // Unported method fails LOUDLY, never silently.
  let loud = false;
  try {
    await p.getHealthForm(sofia.id, ava.id, "any");
  } catch (error) {
    loud = String(error).includes("not ported yet");
  }
  check("unported method throws loudly", loud);

  console.log("\nNOTE: board test submitted casting — re-run scripts/seed-supabase.ts to restore the pristine demo.");

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
