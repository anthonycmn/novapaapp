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

  // Unported method fails LOUDLY, never silently.
  let loud = false;
  try {
    await p.submitEvaluation(dana.id, {
      studentId: ava.id, productionId: frozenId, discipline: "acting",
      scores: {}, notes: "", callbackNotes: "",
    });
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
