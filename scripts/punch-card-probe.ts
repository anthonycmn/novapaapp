/**
 * Read one or more families' day-camp punch cards against the live database
 * and print what the page would say — READ-ONLY, the same loader /day-camps
 * uses. For checking a family's card without signing in as them.
 *
 * Run: npx tsx --tsconfig scripts/tsconfig.json scripts/punch-card-probe.ts <guardian email> [...]
 *      npx tsx --tsconfig scripts/tsconfig.json scripts/punch-card-probe.ts --all-with-day-camps
 */
import { readFileSync } from "node:fs";
// .env.local, the same file next dev reads — no dotenv in this repo.
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";
import { getServiceClient, getWebsiteReadClient } from "../src/lib/api/supabase/client";
import { readPunchCardInput } from "../src/lib/api/registration/punch-card-live";
import { assemblePunchCards } from "../src/lib/api/registration/punch-card";

async function familyIdsFor(args: string[]): Promise<{ label: string; familyId: string }[]> {
  const hub = getServiceClient();
  if (args[0] === "--all-with-day-camps") {
    // Every hub family whose website link buys under an email with a day-camp
    // or pack order line — the section 6 list, found rather than typed.
    const web = getWebsiteReadClient();
    const { data: items } = await web
      .from("order_items")
      .select("activity_id, order:orders!inner(email, status)")
      .range(0, 4999);
    const { data: acts } = await web.from("activities").select("id, offering_kind").range(0, 4999);
    const dayIds = new Set((acts ?? []).filter((a) => a.offering_kind === "day_camp").map((a) => a.id));
    dayIds.add(990010); dayIds.add(990011);
    const emails = new Set<string>();
    for (const it of items ?? []) {
      const order = it.order as unknown as { email?: string; status?: string } | null;
      if (dayIds.has(it.activity_id as number) && order?.email && order.status === "paid") emails.add(order.email.toLowerCase());
    }
    const { data: links } = await hub.from("registration_account_links").select("family_id, external_email").eq("source", "website");
    return (links ?? [])
      .filter((l) => emails.has(String(l.external_email).toLowerCase()))
      .map((l) => ({ label: String(l.external_email), familyId: String(l.family_id) }));
  }
  const out: { label: string; familyId: string }[] = [];
  for (const email of args) {
    const { data } = await hub.from("guardians").select("family_id").ilike("email", email).limit(1).maybeSingle();
    if (data) out.push({ label: email, familyId: String((data as { family_id: string }).family_id) });
    else console.log(`${email}: no hub guardian`);
  }
  return out;
}

async function main() {
  const targets = await familyIdsFor(process.argv.slice(2));
  for (const t of targets.sort((a, b) => a.label.localeCompare(b.label))) {
    const input = await readPunchCardInput(t.familyId);
    if (!input) { console.log(`\n== ${t.label}: UNAVAILABLE`); continue; }
    const board = assemblePunchCards(input);
    console.log(`\n== ${t.label} (${board.cards.length} card${board.cards.length === 1 ? "" : "s"})`);
    for (const card of board.cards) {
      const name = `${card.student.firstName} ${card.student.lastName}`;
      if (!card.camper) { console.log(`  ${name}: NO CAMPER LINK`); continue; }
      const booked = card.days.filter((d) => d.booked);
      const open = card.days.filter((d) => !d.booked && !d.past && !d.full).length;
      console.log(
        `  ${name} (age ${card.age}) · ${card.credits.day} day / ${card.credits.snow} snow · packs ${card.packsBought.length} · booked ${booked.length} · open dates ${open} · ledger ${card.ledger.length}${card.ageNote ? ` · note: ${card.ageNote}` : ""}`
      );
      for (const d of booked) {
        console.log(`     ${d.label} · ${d.booked!.name}${d.booked!.band ? ` (${d.booked!.band.label})` : ""} · ${d.booked!.viaCredit ? "with a credit" : "paid"}`);
      }
    }
  }
}

if (process.argv[2] !== "--reconcile-dry") main().catch((e) => { console.error(e); process.exit(1); });

/*
 * --reconcile-dry <website family email>: the family-scoped snapshot the
 * redeem action feeds to the sync, run through the PURE reconcile against the
 * hub's current rows — no writes. A family whose bookings are all already in
 * the hub must plan zero creates; that is what proves the 15-minute job and
 * the action agree on (student, target).
 */
export async function reconcileDry(email: string): Promise<void> {
  const { WebsiteDbRegistrationProvider } = await import("../src/lib/api/registration/website");
  const { reconcile } = await import("../src/lib/api/registration/reconcile");
  const { fetchCoachingActivityIds } = await import("../src/lib/api/registration/website");
  const web = getWebsiteReadClient();
  const hub = getServiceClient();
  const { data: fam } = await web.from("families").select("id").ilike("email", email).limit(1).maybeSingle();
  if (!fam) { console.log("no website family"); return; }
  const familyExternalId = String((fam as { id: string }).id);
  const snapshot = await new WebsiteDbRegistrationProvider().fetchSnapshot({ familyExternalId });
  console.log(`snapshot: ${snapshot.accounts.length} account, ${snapshot.participants.length} participants, ${snapshot.enrollments.length} enrollments`);
  const [families, guardians, students, enrollments, links, productions, classes] = await Promise.all([
    hub.from("families").select("*"), hub.from("guardians").select("*"), hub.from("students").select("*"),
    hub.from("enrollments").select("*"), hub.from("registration_account_links").select("*"),
    hub.from("productions").select("id, title, registration_activity_id"), hub.from("classes").select("id, name, registration_activity_id"),
  ]);
  const plan = reconcile({
    snapshot,
    families: (families.data ?? []).map((f) => ({ id: f.id, name: f.name })) as never,
    guardians: (guardians.data ?? []).map((g) => ({ id: g.id, familyId: g.family_id, email: g.email ?? "" })) as never,
    students: (students.data ?? []).map((s) => ({ id: s.id, familyId: s.family_id, firstName: s.first_name, lastName: s.last_name, dateOfBirth: s.date_of_birth })) as never,
    enrollments: (enrollments.data ?? []).map((e) => ({ id: e.id, studentId: e.student_id, productionId: e.production_id ?? undefined, classId: e.class_id ?? undefined, coachingActivityId: e.coaching_activity_id ?? undefined, status: e.status, balanceCents: e.balance_cents, source: e.source, amountPaidCents: e.amount_paid_cents ?? undefined, offeringCategory: e.offering_category ?? undefined, sessionStartsOn: e.session_starts_on ?? undefined, createdAt: e.created_at })) as never,
    productions: (productions.data ?? []).map((p) => ({ id: p.id, title: p.title, registrationActivityId: p.registration_activity_id ?? undefined })) as never,
    classes: (classes.data ?? []).map((c) => ({ id: c.id, name: c.name, registrationActivityId: c.registration_activity_id ?? undefined })) as never,
    links: (links.data ?? []).map((l) => ({ familyId: l.family_id, source: l.source, externalId: l.external_id, externalEmail: l.external_email, linkedAt: l.linked_at, autoMatched: l.auto_matched })),
    coachingActivityIds: await fetchCoachingActivityIds(),
    enrollmentExternalIds: new Map((enrollments.data ?? []).filter((e) => e.external_id).map((e) => [String(e.id), String(e.external_id)])),
  });
  console.log(`plan: creates ${plan.creates.length}, updates ${plan.updates.length}, issues ${plan.issues.length}`);
  for (const u of plan.updates) console.log("  update", JSON.stringify(u));
  for (const i of plan.issues) console.log("  issue", i.kind, i.message);
}

if (process.argv[2] === "--reconcile-dry") {
  reconcileDry(process.argv[3]).catch((e) => { console.error(e); process.exit(1); });
}
