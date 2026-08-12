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

  // Unported method fails LOUDLY, never silently.
  let loud = false;
  try {
    await p.getMyLessonBookings(sofia.id);
  } catch (error) {
    loud = String(error).includes("not ported yet");
  }
  check("unported method throws loudly", loud);

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
