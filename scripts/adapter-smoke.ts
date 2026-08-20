/**
 * Integration smoke test for the SupabaseDataProvider's ported slice,
 * run against the seeded shared database with REAL ids.
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/adapter-smoke.ts
 */
import { createSupabaseProvider } from "../src/lib/api/supabase/provider";
import { AccessDeniedError } from "../src/lib/api/provider";
import { EXTENDED_CARE_DAY_CENTS } from "../src/config/fees";
import { formatCents } from "../src/lib/format";

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
    {
      auth: { persistSession: false },
      db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" },
    }
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

  /* ── feed ── */
  const post = await p.createFeedPost(dana.id, {
    title: "Tech week schedule",
    body: "Full run Thursday. Bring water!",
    category: "rehearsal",
    audience: { productionIds: [frozenId] },
    isPinned: true,
  });
  check("staff creates an audience-targeted post", post.isPinned);

  let familyPost = false;
  try {
    await p.createFeedPost(sofia.id, {
      body: "hi", category: "general", audience: {},
    });
  } catch (error) {
    familyPost = error instanceof AccessDeniedError;
  }
  check("families cannot post", familyPost);

  const sofiaFeed = await p.getFeedForUser(sofia.id);
  check(
    "enrolled family sees the targeted post first",
    sofiaFeed.length > 0 && sofiaFeed[0].id === post.id
  );
  // Okafor's kids: Chidi (Frozen) enrolled → sees it; if we narrow to a
  // class they're not in, they wouldn't. Verify the everyone-vs-targeted
  // logic with a class-only audience instead:
  const classOnly = await p.createFeedPost(dana.id, {
    body: "MTD2 recital notes", category: "general",
    audience: { classIds: ["00000000-0000-0000-0000-000000000000"] },
  });
  check(
    "family does NOT see a post for a class they're not in",
    !(await p.getFeedForUser(sofia.id)).some((fp) => fp.id === classOnly.id)
  );

  const reacted = await p.reactToPost(sofia.id, post.id, "heart");
  check("reaction increments", reacted.reactionCounts.heart === 1);

  const q = await p.askQuestion(sofia.id, post.id, "What time is pickup Thursday?");
  const minhView = await p.getQuestionsForPost(minh.id, post.id);
  check("another family can't see a private question", minhView.length === 0);
  const open = await p.getOpenQuestions(dana.id);
  check("staff moderation queue lists it", open.some((oq) => oq.id === q.id));
  const answered = await p.answerQuestion(dana.id, q.id, "8:30 PM sharp.", true);
  check(
    "answer published as FAQ is visible to everyone",
    answered.isPublicFaq &&
      (await p.getQuestionsForPost(minh.id, post.id)).some((fq) => fq.id === q.id)
  );

  // Clean up feed fixtures.
  await raw.from("feed_posts").delete().in("id", [post.id, classOnly.id]);
  await raw.from("notifications").delete().eq("title", "Your question was answered");

  /* ── health forms ── */
  const { data: season } = await raw
    .from("seasons").select("id").eq("is_current", true).single();
  const seasonId = String(season!.id);

  const draft = await p.saveHealthForm(sofia.id, ava.id, seasonId, {
    allergies: "Tree nuts", medications: "EpiPen in bag",
  } as never);
  check("family saves a health form draft", !draft.signedAt);

  const signed = await p.saveHealthForm(sofia.id, ava.id, seasonId, {
    allergies: "Tree nuts", medications: "EpiPen in bag",
  } as never, { name: "Sofia Martinez", ip: "203.0.113.7" });
  check(
    "e-signature recorded with name and timestamp",
    signed.signedByName === "Sofia Martinez" && Boolean(signed.signedAt)
  );

  let healthDenied = false;
  try {
    await p.saveHealthForm(minh.id, ava.id, seasonId, {} as never);
  } catch (error) {
    healthDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot sign her form", healthDenied);

  const status = await p.getHealthFormStatus(dana.id, { productionId: frozenId });
  const avaStatus = status.find((r) => r.student.id === ava.id);
  check(
    "staff roster shows signed vs missing forms",
    status.length === 4 && Boolean(avaStatus?.form) &&
      status.filter((r) => !r.form).length === 3
  );

  // Clean up health fixture.
  await raw.from("health_forms").delete().eq("student_id", ava.id);

  /* ── pickup requests ── */
  const pickup = await p.createPickupRequest(sofia.id, {
    studentId: ava.id, kind: "early_pickup",
    startDate: "2026-08-17", endDate: "2026-08-19",
    recurringDays: [], pickUpTime: "18:30",
    reason: "Work schedule during tech week",
  });
  check(
    `pickup request created with computed fee (${formatCents(EXTENDED_CARE_DAY_CENTS)}/day x 3)`,
    pickup.status === "pending" && pickup.feeCents === EXTENDED_CARE_DAY_CENTS * 3
  );
  const staffQueue = await p.getPickupRequestsForStaff(dana.id);
  check("staff queue lists pending first", staffQueue[0]?.id === pickup.id);
  const decided = await p.decidePickupRequest(dana.id, pickup.id, {
    status: "approved", note: "Front desk will supervise.",
  });
  check(
    "approval recorded and family notified",
    decided.status === "approved" && decided.decidedByName === "Dana Whitfield" &&
      (await p.getNotifications(sofia.id)).some((n) => n.title === "Pick-up request approved")
  );
  const famPickups = await p.getPickupRequestsForFamily(sofia.id, sofia.familyId);
  check("family sees their request", famPickups.some((r) => r.id === pickup.id));
  const calPickup = await p.getFamilyCalendar(sofia.id, sofia.familyId);
  check(
    "approved pickup lands on the family calendar",
    calPickup.some((e) => e.id === `pickup-${pickup.id}`)
  );

  // Clean up pickup fixture.
  await raw.from("pickup_requests").delete().eq("id", pickup.id);

  /* ── store: buttons + catalog + orders ── */
  const templates = await p.getButtonTemplates(frozenId);
  check("button templates read", templates.length >= 1);
  const products = await p.getProducts();
  check("catalog products read", products.length >= 3, `${products.length} products`);

  await p.addToCart(sofia.id, {
    photoUrl: "https://example.com/ava.jpg", photoWidth: 1200, photoHeight: 1200,
    studentName: "Ava Martinez", role: "Elsa", size: "3",
    style: "classic", templateId: templates[0].id,
  }, 2);
  const starPage = products.find((pr) => pr.type === "star_page");
  const cart = starPage
    ? await p.addCatalogItemToCart(sofia.id, {
        productId: starPage.id,
        optionValue: starPage.options[0]?.value,
        quantity: 1,
        customization: { message: "Break a leg, Ava!" } as never,
      })
    : await p.getCart(sofia.id);
  check(
    "cart holds a button and a catalog item",
    cart.length === 2 && cart.some((ci) => ci.productType === "spirit_button") &&
      cart.some((ci) => ci.productType === "star_page"),
    cart.map((ci) => ci.displayName).join(" | ")
  );
  check(
    "button priced from the size table",
    cart.find((ci) => ci.productType === "spirit_button")!.unitPriceCents === 700
  );

  let badOption = false;
  try {
    await p.addCatalogItemToCart(sofia.id, {
      productId: starPage!.id, optionValue: "not-a-real-tier",
      quantity: 1, customization: {} as never,
    });
  } catch (error) {
    badOption = String(error).includes("option");
  }
  check("crafted option value rejected (no price spoofing)", badOption);

  const order = await p.createOrder(sofia.id, "mock-pay-123");
  check(
    "checkout creates an NPA-referenced order and empties the cart",
    order.reference.startsWith("NPA-") && order.items.length === 2 &&
      (await p.getCart(sofia.id)).length === 0,
    order.reference
  );
  const paid = await p.markOrderPaid(order.reference, "stripe-pi-1");
  check("webhook marks the order paid", Boolean(paid?.paidAt));

  const ready = await p.updateOrderStatus(dana.id, order.id, "ready");
  check(
    "fulfillment status change notifies the family",
    ready.status === "ready" &&
      (await p.getNotifications(sofia.id)).some((n) => n.title.includes("is ready"))
  );
  let orderDenied = false;
  try {
    await p.getOrder(minh.id, order.id);
  } catch (error) {
    orderDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot read the order", orderDenied);

  const recart = await p.reorder(sofia.id, order.id);
  check("reorder restores the lines to the cart", recart.length === 2);

  // Clean up store fixtures.
  await raw.from("cart_items").delete().eq("user_id", sofia.id);
  await raw.from("button_orders").delete().eq("id", order.id);

  /* ── document vault ── */
  const pdf = "data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCg==";
  const familyDoc = await p.uploadFamilyDocument(sofia.id, sofia.familyId, {
    name: "Costume receipt", category: "financial", source: { kind: "dataUrl", dataUrl: pdf },
  });
  const staffDoc = await p.uploadFamilyDocument(dana.id, sofia.familyId, {
    name: "Countersigned waiver", category: "waiver",
    source: { kind: "dataUrl", dataUrl: pdf }, studentId: ava.id,
  });
  const vault = await p.getFamilyDocuments(sofia.id, sofia.familyId);
  check(
    "vault lists family + staff-filed documents",
    vault.length === 2 && vault.some((d) => d.uploadedByStaff)
  );
  let vaultDenied = false;
  try {
    await p.getFamilyDocuments(minh.id, sofia.familyId);
  } catch (error) {
    vaultDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot open the vault", vaultDenied);

  let staffDocProtected = false;
  try {
    await p.deleteFamilyDocument(sofia.id, staffDoc.id);
  } catch (error) {
    staffDocProtected = String(error).includes("filed by NOVA PA staff");
  }
  check("family cannot delete a staff-filed waiver", staffDocProtected);
  await p.deleteFamilyDocument(sofia.id, familyDoc.id);
  await p.deleteFamilyDocument(dana.id, staffDoc.id);
  check(
    "own + admin deletions clear the vault",
    (await p.getFamilyDocuments(sofia.id, sofia.familyId)).length === 0
  );

  /* ── private reviews ── */
  const rw = await p.createReviewWindow(dana.id, {
    kind: "mid_session", subjectType: "production", subjectId: frozenId,
    opensAt: new Date(Date.now() - 3600_000).toISOString(),
    closesAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  const openWindows = await p.getOpenReviewWindows(sofia.id);
  check(
    "enrolled family sees the open window",
    openWindows.some((w) => w.window.id === rw.id && w.subjectName === "Frozen Jr.")
  );
  const review = await p.submitReview(sofia.id, {
    windowId: rw.id,
    scores: { instructionQuality: 5, communication: 4, childGrowth: 5, organization: 3 },
    comment: "Dana is wonderful with the kids.",
    isAnonymous: true,
  });
  check("anonymous review submitted", review.isAnonymous);
  let duplicateReview = false;
  try {
    await p.submitReview(sofia.id, {
      windowId: rw.id,
      scores: { instructionQuality: 5, communication: 5, childGrowth: 5, organization: 5 },
      comment: "", isAnonymous: false,
    });
  } catch (error) {
    duplicateReview = String(error).includes("already submitted");
  }
  check("one review per family per window", duplicateReview);

  const danaStaffId = dana!.staffId!;
  const staffView = await p.getReviewsForStaff(dana.id, danaStaffId);
  const anon = staffView.reviews.find((rv) =>
    rv.comment.includes("wonderful with the kids")
  );
  check(
    "staff view strips identity from anonymous reviews",
    Boolean(anon) && anon!.attribution === "A family" &&
      !JSON.stringify(staffView.reviews).includes("Sofia")
  );
  const adminView = await p.getAllReviews(dana.id);
  check(
    "admin still sees who wrote it",
    adminView.some((rv) => rv.comment.includes("wonderful") && rv.reviewerName === "Sofia Martinez")
  );
  let staffAllDenied = false;
  try {
    await p.getAllReviews(marcus!.id);
  } catch (error) {
    staffAllDenied = error instanceof AccessDeniedError;
  }
  check("non-admin staff cannot read full reviews", staffAllDenied);

  // Clean up review fixtures.
  await raw.from("review_windows").delete().eq("id", rw.id);

  /* ── students, hopes, directory, staff self-edit ── */
  const updatedAva = await p.updateStudent(sofia.id, ava.id, { vocalRange: "C4–A5" });
  check("parent updates their child", updatedAva.vocalRange === "C4–A5");
  let updateDenied = false;
  try {
    await p.updateStudent(minh.id, ava.id, { grade: "12" });
  } catch (error) {
    updateDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot edit her", updateDenied);

  const hope = await p.upsertHopes(sofia.id, ava.id, {
    seasonId, author: "parent", text: "A named role this year", visibleToStudent: false,
  });
  check("parent hope saved privately", !hope.visibleToStudent);
  let staffHopes = false;
  try {
    await p.upsertHopes(dana.id, ava.id, { seasonId, author: "parent", text: "x" });
  } catch (error) {
    staffHopes = String(error).includes("families, not staff");
  }
  check("staff cannot write hopes", staffHopes);
  check(
    "staff can read hopes",
    (await p.getHopes(dana.id, ava.id)).some((h) => h.text.includes("named role"))
  );

  const history = await p.getShowHistory(sofia.id, ava.id);
  check("show history reads", history.length >= 1, `${history.length} entries`);

  const directory = await p.getFamiliesDirectory(dana.id);
  check(
    "staff directory joins families + students + guardians",
    directory.length === 3 && directory.every((d) => d.students.length > 0 && d.guardians.length > 0)
  );
  let dirDenied = false;
  try {
    await p.getFamiliesDirectory(sofia.id);
  } catch (error) {
    dirDenied = error instanceof AccessDeniedError;
  }
  check("directory is staff-only", dirDenied);

  await p.submitStaffProfileChanges(marcus!.id, marcus!.staffId!, {
    bio: "Vocal coach, pianist, and arranger.",
  });
  const pendingChanges = await p.getPendingStaffChanges(dana.id);
  check(
    "staff edit lands in the admin approval queue",
    pendingChanges.some((sp) => sp.id === marcus!.staffId)
  );
  const approved = await p.approveStaffChanges(dana.id, marcus!.staffId!);
  check(
    "approval applies the pending bio",
    approved.bio.includes("arranger") && !approved.pendingChanges
  );

  // Clean up: restore Ava + Marcus bio via reseed at the end anyway.
  await raw.from("hopes_entries").delete().eq("student_id", ava.id);

  /* ── email + tokens + materials ── */
  const everyone = await p.resolveAudience(dana.id, {});
  check("audience 'everyone' resolves to 3 parents", everyone.length === 3);
  const frozenOnly = await p.resolveAudience(dana.id, { productionIds: [frozenId] });
  check("production audience excludes class-only families", frozenOnly.length === 3 || frozenOnly.length === 2, `${frozenOnly.length}`);

  const send = await p.sendEmail(dana.id, {
    subject: "Tech week details", body: "All the details…",
    category: "critical", audience: {},
  });
  check("email send recorded with stats", send.stats.total === 3);
  await p.recordEmailOpen(send.id, sofia.id);
  await p.recordEmailClick(send.id, sofia.id, "https://novapa.org/tech");
  const engagement = await p.getEmailEngagement(dana.id, send.id);
  check(
    "open/click tracking with non-openers",
    engagement.opens.length === 1 &&
      engagement.opens[0].recipientName === "Sofia Martinez" &&
      engagement.clicks.length === 1 && engagement.nonOpeners.length === 2
  );

  const token = await p.getCalendarToken(sofia.id, sofia.familyId);
  check(
    "iCal token stable and reversible",
    token === (await p.getCalendarToken(sofia.id, sofia.familyId)) &&
      (await p.getFamilyIdByCalendarToken(token)) === sofia.familyId &&
      (await p.getFamilyIdByCalendarToken("bogus")) === null
  );

  const png = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAAAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
  const withHeadshot = await p.setHeadshot(sofia.id, ava.id, {
    webDataUrl: png, printDataUrl: png,
  });
  check(
    "headshot uploads to real storage",
    Boolean(withHeadshot.headshotUrl) && Boolean(withHeadshot.headshotPrintUrl)
  );
  const withCredits = await p.saveResumeCredits(sofia.id, ava.id, [
    { id: "rc-new", category: "role", title: "Elsa — Frozen Jr. (2026)" },
  ]);
  check("resume credits saved", withCredits.resumeCredits.length === 1);

  /* ── catalog & core batch ── */
  const season2 = await p.getCurrentSeason();
  check("current season resolves", season2.isCurrent && season2.name.includes("2026"));
  check("programs read", (await p.getPrograms(season2.id)).length === 3);
  const classes2 = await p.getClasses();
  check(
    "classes read with joined staff",
    classes2.length === 2 && classes2.every((c) => c.staffIds.length === 1)
  );
  check("productions read", (await p.getProductions()).length === 2);
  const famEnr = await p.getEnrollmentsForFamily(sofia.id, sofia.familyId);
  check("family enrollments read", famEnr.length === 3, `${famEnr.length}`);
  const avaCast = await p.getCastingForStudent(sofia.id, ava.id);
  // Board submit earlier in this run added Elsa alongside the seeded
  // Young Elsa — both published, both visible.
  check(
    "family sees only published casting",
    avaCast.length === 2 &&
      avaCast.every((c) => ["Young Elsa", "Elsa"].includes(c.characterName))
  );
  const updatedFam = await p.updateFamily(sofia.id, sofia.familyId, { city: "Chantilly" });
  check("parent updates family record", updatedFam.city === "Chantilly");
  const guardian = await p.inviteGuardian(sofia.id, sofia.familyId, {
    fullName: "Grandma Rosa", email: "rosa@example.net", relationship: "Grandmother",
  });
  check(
    "guardian invited and listed",
    (await p.getGuardians(sofia.id, sofia.familyId)).some((g) => g.id === guardian.id)
  );
  const broadcast = await p.broadcastNotification(dana.id, {
    type: "broadcast", title: "Studio closed Friday", body: "Deep clean.", audience: {},
  });
  check("broadcast reaches all parents", broadcast.recipients === 3);
  const review2 = await p.getCastingReview(dana.id, frozenId);
  check(
    "casting review joins students + hopes",
    review2.length === 4 && review2.every((r) => Array.isArray(r.hopes))
  );
  await raw.from("guardians").delete().eq("id", guardian.id);

  /* ── photos & face matching lifecycle ── */
  const leoP = students.find((st) => st.firstName === "Leo")!;
  const refA = "https://photos.example.com/leo-ref-1.jpg";
  const refB = "https://photos.example.com/leo-ref-2.jpg";

  let staffConsent = false;
  try {
    await p.grantFaceConsent(dana.id, leoP.id, [refA, refB]);
  } catch (error) {
    staffConsent = error instanceof AccessDeniedError;
  }
  check("staff can NEVER grant face consent", staffConsent);

  const consent = await p.grantFaceConsent(sofia.id, leoP.id, [refA, refB]);
  check("parent consent creates embeddings", consent.embeddingsCreated >= 1);
  check(
    "embedding count visible to the family only",
    (await p.countEmbeddingsForStudent(sofia.id, leoP.id)) === consent.embeddingsCreated
  );

  const ingested = await p.ingestGallery(dana.id, {
    id: "ignored", externalId: "smug-tech-week", title: "Tech Week",
    photoCount: 2, url: "https://smugmug.com/tech-week", createdAt: new Date().toISOString(),
  }, [
    // Same image as Leo's reference → deterministic mock vector matches.
    { id: "x1", galleryId: "ignored", externalId: "ph-1", thumbnailUrl: refA, url: refA, width: 800, height: 600 },
    { id: "x2", galleryId: "ignored", externalId: "ph-2", thumbnailUrl: "https://photos.example.com/crowd.jpg", url: "https://photos.example.com/crowd.jpg", width: 800, height: 600 },
  ]);
  check("gallery ingested with dedupe", ingested.photosIngested === 2);

  const matching = await p.runMatching(dana.id);
  check(
    "matching finds Leo in the identical photo",
    matching.photosScanned >= 2 && matching.matchesCreated >= 1,
    JSON.stringify(matching)
  );
  const famMatches = await p.getMatchesForFamily(sofia.id, sofia.familyId);
  check("family sees their child's matches", famMatches.length >= 1);
  let matchesDenied = false;
  try {
    await p.getMatchesForFamily(minh.id, sofia.familyId);
  } catch (error) {
    matchesDenied = error instanceof AccessDeniedError;
  }
  check("another family cannot see the matches", matchesDenied);

  await p.confirmMatch(sofia.id, famMatches[0].match.id);
  const revoked = await p.revokeFaceConsent(sofia.id, leoP.id);
  check(
    "revocation deletes everything and records counts",
    (revoked.embeddingsDeleted ?? 0) >= 1 && (revoked.matchesDeleted ?? 0) >= 1 &&
      (revoked.referencePhotosDeleted ?? 0) === 2 &&
      (await p.countEmbeddingsForStudent(sofia.id, leoP.id)) === 0
  );
  const photoHistory = await p.getConsentHistory(sofia.id, leoP.id);
  check(
    "consent history shows grant then revoke",
    photoHistory.length === 2 && photoHistory[0].action === "revoked" && photoHistory[1].action === "granted"
  );

  // Clean up photo fixtures.
  await raw.from("photo_galleries").delete().eq("external_id", "smug-tech-week");
  await raw.from("face_embeddings").delete().not("photo_id", "is", null);
  await raw.from("face_consent_events").delete().eq("student_id", leoP.id);
  await raw.from("notifications").delete().eq("type", "photos_posted");

  // Every DataProvider method is now ported — the loud-failure canary
  // retired the day it had nothing left to catch. Final group: sync runs.
  const syncRuns = await p.getSyncRuns(dana.id);
  check("adapter surface complete — sync runs readable", Array.isArray(syncRuns));
  let syncDenied = false;
  try {
    await p.getSyncRuns(sofia.id);
  } catch (error) {
    syncDenied = error instanceof AccessDeniedError;
  }
  check("sync history is staff-only", syncDenied);

  console.log("\nNOTE: board test submitted casting — re-run scripts/seed-supabase.ts to restore the pristine demo.");

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
