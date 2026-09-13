/**
 * Issue retroactive Dependent Care FSA statements for the Broadway Bound
 * Summer Camp 2026 (sessions June 29 – July 11 and July 13 – July 25, 2026),
 * one PDF per family, filed in the family vault with a notification.
 *
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/issue-fsa-letters.ts            # dry run: PDFs + report on disk, nothing written
 *   npx tsx --tsconfig scripts/tsconfig.json scripts/issue-fsa-letters.ts --issue    # file in the vault and notify
 *   ... --only parent@example.com     limit to one family (either mode)
 *   ... --out <dir>                   where the dry run writes (default: scripts/out/fsa-letters)
 *
 * WHY THIS IS A SCRIPT AND NOT THE FSA PAGE. The summer 2026 camp sold
 * through Sawyer, and its rows live only in public.legacy_enrollments — the
 * sync never turned them into hub enrollments (the activity text matched no
 * catalog entry), so /family/students/[id]/fsa shows those families "no camp
 * fees". CJ, 13 Sep 2026: "create the FSA letters and put them in the family
 * vault for each family who is eligible ... this will be a retroactive letter."
 *
 * WHAT THE LETTER SAYS, AND WHY IT SAYS ONLY THAT. Every figure is what the
 * registration record shows was paid to NOVA PA for that order — nothing is
 * split, estimated or netted by hand. A Sawyer order can cover several
 * children on one line with one total; the letter prints that line once,
 * naming every child on it, rather than inventing a per-child split. The
 * under-13 test (IRS Publication 503) is applied per child at the END of the
 * session, the same conservative reading src/lib/api/documents/fsa.ts uses.
 *
 * WHAT IS HELD BACK FOR A HUMAN (reported, never issued):
 *   - $0 orders — nothing was paid to NOVA PA, so there is nothing to certify
 *     (these were mostly funded by a 2025 tuition credit held by the boosters).
 *   - orders that paid exactly $119.16 — the amount Sawyer retained on every
 *     confirmed cancellation (Bowker, Kao, Mundy); a fee kept for care not
 *     provided is not a dependent care expense.
 *   - a child we cannot find in the register, or whose date of birth is
 *     unknown — age is the eligibility test and cannot be guessed.
 *   - a family with no parent portal account — there is no vault to file into.
 *
 * Re-runnable: a family whose letter is already in the vault (same storage
 * path) is skipped, so a second run never files twice or notifies twice.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// .env.local, the same file next dev reads — no dotenv in this repo.
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
process.env.NEXT_PUBLIC_DATA_MODE = "supabase";

import puppeteer from "puppeteer-core";
import { org, taxDetailsComplete } from "../src/config/org";
import { ageOn, FSA_AGE_LIMIT } from "../src/lib/api/documents/fsa";
import { getStorageProvider } from "../src/lib/api/storage";
import { getServiceClient, getWebsiteReadClient } from "../src/lib/api/supabase/client";
import { formatCents } from "../src/lib/format";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

/** The program, as the letter and the vault name it. */
const PROGRAM = "Broadway Bound Summer Camp 2026";
const STORAGE_PREFIX = "fsa/broadway-bound-summer-2026";
const DOCUMENT_NAME = `Dependent Care FSA statement — ${PROGRAM}`;

/**
 * The two sessions. Sawyer's `dates` column is truncated at 120 characters,
 * so the session is read from the activity's own name — every cast carries
 * its performance date — and the tech camp from CJ's correspondence
 * ("Technical Theatre Camp (June 29 to July 10)").
 */
const SESSIONS = {
  one: { start: "2026-06-29", end: "2026-07-11", label: "June 29 – July 11, 2026" },
  two: { start: "2026-07-13", end: "2026-07-25", label: "July 13 – July 25, 2026" },
} as const;

/**
 * The EIN on these letters, and only these. CJ, 13 Sep 2026, asked which of
 * the two numbers in circulation goes on the summer 2026 letters and chose
 * this one — the number he gave parents for "the 2026 Summer Camp" in
 * January and February, and the one Todd sent him as "CJ Creative LLC
 * 99-1421341" on 6 Jan 2026. org.tax.ein still reads 47-4903843 and prints on
 * the in-app FSA page; reconciling the two is CJ's call, not this script's.
 */
const EIN = "99-1421341";

/** Sawyer kept exactly this on every confirmed cancellation. */
const CANCELLATION_RETAINED_CENTS = 11916;

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const normalize = (name: string) =>
  name.toLowerCase().replace(/[`'’“”"]/g, "").replace(/\s+/g, " ").trim();

const args = process.argv.slice(2);
const ISSUE = args.includes("--issue");
const opt = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const ONLY = opt("only")?.toLowerCase();
const OUT = opt("out") ?? join(process.cwd(), "scripts", "out", "fsa-letters");

interface Activity {
  name: string;
  session: keyof typeof SESSIONS;
}

function sessionFor(activity: string): keyof typeof SESSIONS | undefined {
  if (/July 1[01]/i.test(activity)) return "one";
  if (/July 2[45]/i.test(activity)) return "two";
  if (/Technical Theatre Camp/i.test(activity)) return "one";
  return undefined;
}

/** "A | July 24th ..., Broadway Bound B | ..." → the activities on the line. */
function splitActivities(text: string): Activity[] {
  return text
    .split(/,\s*(?=Broadway Bound)/)
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((name) => ({ name, session: sessionFor(name) ?? "one" }));
}

interface Child {
  name: string;
  dateOfBirth?: string;
  matched: boolean;
  age?: number;
  eligible: boolean;
}

interface Line {
  rowId: string;
  orderRef: string;
  activities: Activity[];
  periodStart: string;
  periodEnd: string;
  children: Child[];
  paidCents: number;
  /** Reasons this line cannot go on a letter; empty when it can. */
  holds: string[];
}

interface Letter {
  hubFamilyId: string;
  email: string;
  familyName: string;
  guardianName: string;
  lines: Line[];
  /** Lines held back or ineligible — reported, and named on the letter when the family still gets one. */
  excluded: Line[];
}

async function main() {
  if (!taxDetailsComplete()) throw new Error("org.tax is incomplete — refusing to issue");
  const hub = getServiceClient();
  const web = getWebsiteReadClient();

  const [legacy, families, campers, links, hubFamilies, guardians, profiles, prefs, existing] =
    await Promise.all([
      all(web, "legacy_enrollments", "id, order_ref, email, camper_name, activity_text, dates, paid_cents"),
      all(web, "families", "id, email, parent_name, is_test"),
      all(web, "campers", "id, family_id, name, birthdate"),
      all(hub, "registration_account_links", "family_id, external_id"),
      all(hub, "families", "id, name"),
      all(hub, "guardians", "family_id, full_name, is_primary, email"),
      all(hub, "profiles", "id, family_id, role"),
      all(hub, "notification_prefs", "user_id, enabled"),
      all(hub, "family_documents", "family_id, storage_path"),
    ]);

  const familyByEmail = new Map<string, Row>();
  for (const f of families) familyByEmail.set(str(f.email).toLowerCase(), f);
  const hubFamilyByWebId = new Map<string, string>();
  for (const l of links) hubFamilyByWebId.set(String(l.external_id), String(l.family_id));
  const hubFamilyName = new Map(hubFamilies.map((f) => [String(f.id), str(f.name)]));
  const campersByFamily = new Map<string, Row[]>();
  for (const c of campers) {
    const key = String(c.family_id);
    campersByFamily.set(key, [...(campersByFamily.get(key) ?? []), c]);
  }
  const alreadyFiled = new Set(
    existing.filter((d) => String(d.storage_path).startsWith(STORAGE_PREFIX)).map((d) => String(d.family_id))
  );

  const rows = legacy.filter(
    (r) =>
      /^Broadway Bound/i.test(str(r.activity_text)) &&
      /(6\/29|7\/13)\/2026/.test(str(r.dates)) &&
      (!ONLY || str(r.email).toLowerCase() === ONLY)
  );

  const letters = new Map<string, Letter>();
  const unattributed: string[] = [];

  for (const r of rows) {
    const email = str(r.email).toLowerCase();
    const webFamily = familyByEmail.get(email);
    const hubFamilyId = webFamily ? hubFamilyByWebId.get(String(webFamily.id)) : undefined;
    if (!webFamily || !hubFamilyId || webFamily.is_test) {
      unattributed.push(`${r.id}\t${email}\t${str(r.camper_name)}\t${webFamily ? (webFamily.is_test ? "test family" : "no portal account") : "no website family"}`);
      continue;
    }

    const activities = splitActivities(str(r.activity_text));
    const starts = activities.map((a) => SESSIONS[a.session].start).sort();
    const ends = activities.map((a) => SESSIONS[a.session].end).sort();
    const periodStart = starts[0];
    const periodEnd = ends[ends.length - 1];

    const names = str(r.camper_name).split(",").map((n) => n.trim()).filter(Boolean);
    const familyCampers = campersByFamily.get(String(webFamily.id)) ?? [];
    const children: Child[] = names.map((name) => {
      const wanted = normalize(name);
      let camper = familyCampers.find((c) => normalize(str(c.name)) === wanted);
      if (!camper) {
        // First name alone, when that names exactly one child in the family.
        const first = wanted.split(" ")[0];
        const byFirst = familyCampers.filter((c) => normalize(str(c.name)).split(" ")[0] === first);
        if (byFirst.length === 1) camper = byFirst[0];
      }
      const dob = camper ? str(camper.birthdate) || undefined : undefined;
      const age = dob ? ageOn(dob, periodEnd) : undefined;
      return {
        name: camper ? str(camper.name) : name,
        dateOfBirth: dob,
        matched: Boolean(camper),
        age,
        eligible: age !== undefined && age < FSA_AGE_LIMIT,
      };
    });

    const paidCents = Number(r.paid_cents ?? 0);
    const holds: string[] = [];
    if (names.length === 0) holds.push("no camper named on the order");
    if (paidCents <= 0) holds.push("$0 paid to NOVA PA");
    if (paidCents === CANCELLATION_RETAINED_CENTS) holds.push("paid exactly $119.16 — the retained cancellation fee");
    for (const c of children) {
      if (!c.matched) holds.push(`"${c.name}" is not a camper on this family's register`);
      else if (!c.dateOfBirth) holds.push(`${c.name} has no date of birth on file`);
    }
    if (holds.length === 0 && !children.some((c) => c.eligible)) {
      holds.push(`no child under ${FSA_AGE_LIMIT} at the end of the session`);
    }

    const line: Line = {
      rowId: String(r.id),
      orderRef: str(r.order_ref),
      activities,
      periodStart,
      periodEnd,
      children,
      paidCents,
      holds,
    };

    let letter = letters.get(hubFamilyId);
    if (!letter) {
      const fam = guardians.filter((g) => String(g.family_id) === hubFamilyId);
      const primary = fam.find((g) => g.is_primary) ?? fam[0];
      letter = {
        hubFamilyId,
        email,
        familyName: hubFamilyName.get(hubFamilyId) ?? str(webFamily.parent_name),
        guardianName: str(primary?.full_name) || str(webFamily.parent_name),
        lines: [],
        excluded: [],
      };
      letters.set(hubFamilyId, letter);
    }
    (holds.length ? letter.excluded : letter.lines).push(line);
  }

  mkdirSync(OUT, { recursive: true });
  const issuable = [...letters.values()].filter((l) => l.lines.length > 0);
  const heldOnly = [...letters.values()].filter((l) => l.lines.length === 0);

  // ── report ────────────────────────────────────────────────────────────
  const report: string[] = [];
  report.push(`# FSA letters — ${PROGRAM} — ${ISSUE ? "ISSUED" : "DRY RUN"} ${new Date().toISOString()}`);
  report.push(`rows considered: ${rows.length}`);
  report.push(`families with a letter: ${issuable.length} (${issuable.reduce((n, l) => n + l.lines.length, 0)} lines, ${formatCents(issuable.reduce((n, l) => n + l.lines.reduce((m, x) => m + x.paidCents, 0), 0))})`);
  report.push(`families with nothing issuable: ${heldOnly.length}`);
  report.push(`rows with no family to file into: ${unattributed.length}`);
  report.push("");
  report.push("## Held back (hand review)");
  report.push("family\temail\torder\tchildren\tpaid\treason");
  for (const l of [...letters.values()]) {
    for (const x of l.excluded) {
      report.push(`${l.familyName}\t${l.email}\t${x.orderRef}\t${x.children.map((c) => `${c.name}${c.age !== undefined ? ` (${c.age})` : ""}`).join("; ")}\t${formatCents(x.paidCents)}\t${x.holds.join("; ")}`);
    }
  }
  report.push("");
  report.push("## No family to file into");
  report.push("row\temail\tcampers\treason");
  report.push(...unattributed);
  report.push("");
  report.push("## Letters");
  report.push("family\temail\tlines\ttotal\tchildren\tstatus");

  // ── render, file, notify ──────────────────────────────────────────────
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const storage = getStorageProvider();
  const parentsByFamily = new Map<string, string[]>();
  for (const p of profiles) {
    if (p.role !== "parent" || !p.family_id) continue;
    const key = String(p.family_id);
    parentsByFamily.set(key, [...(parentsByFamily.get(key) ?? []), String(p.id)]);
  }
  const prefByUser = new Map(prefs.map((p) => [String(p.user_id), (p.enabled ?? {}) as Record<string, boolean>]));

  let filed = 0;
  let notified = 0;
  for (const letter of issuable.sort((a, b) => a.familyName.localeCompare(b.familyName))) {
    const total = letter.lines.reduce((n, x) => n + x.paidCents, 0);
    const children = [...new Set(letter.lines.flatMap((x) => x.children.filter((c) => c.eligible).map((c) => c.name)))];
    let status: string;

    if (alreadyFiled.has(letter.hubFamilyId)) {
      status = "already in vault — skipped";
    } else {
      await page.setContent(renderLetter(letter), { waitUntil: "load" });
      const pdf = Buffer.from(await page.pdf({ format: "letter", printBackground: true, margin: { top: "0.75in", right: "0.75in", bottom: "0.75in", left: "0.75in" } }));
      const fileName = `${letter.familyName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "family"}-${letter.hubFamilyId.slice(0, 8)}.pdf`;
      writeFileSync(join(OUT, fileName), pdf);

      if (ISSUE) {
        const path = `${STORAGE_PREFIX}/${letter.hubFamilyId}.pdf`;
        const stored = await storage.upload(
          "family-documents",
          path,
          `data:application/pdf;base64,${pdf.toString("base64")}`
        );
        const { error } = await hub.from("family_documents").insert({
          family_id: letter.hubFamilyId,
          student_id: null,
          name: DOCUMENT_NAME,
          category: "financial",
          file_url: stored.url,
          storage_path: stored.path,
          content_type: "application/pdf",
          size_bytes: stored.sizeBytes,
          uploaded_by_name: org.tax.signatoryName,
          uploaded_by_staff: true,
        });
        if (error) throw new Error(`family_documents insert failed for ${letter.email}: ${error.message}`);
        filed += 1;

        // Same rule as SupabaseProvider.notifyFamilies: a parent who switched
        // announcements off asked not to be told, and this is not a licence
        // to override that. The letter is still in their vault.
        const recipients = (parentsByFamily.get(letter.hubFamilyId) ?? []).filter(
          (userId) => prefByUser.get(userId)?.announcement !== false
        );
        if (recipients.length) {
          const { error: nErr } = await hub.from("notifications").insert(
            recipients.map((userId) => ({
              user_id: userId,
              type: "announcement",
              title: "Your Dependent Care FSA statement is ready",
              body: `Your statement for ${PROGRAM} (${children.join(", ")}) is in your family vault under Financial / receipts. Download it for your FSA administrator.`,
              url: "/family/documents",
            }))
          );
          if (nErr) throw new Error(`notification insert failed for ${letter.email}: ${nErr.message}`);
          notified += recipients.length;
        }
        status = `filed; ${recipients.length} parent(s) notified`;
      } else {
        status = `pdf written: ${fileName}`;
      }
    }
    report.push(`${letter.familyName}\t${letter.email}\t${letter.lines.length}\t${formatCents(total)}\t${children.join("; ")}\t${status}`);
  }
  await browser.close();

  report.push("");
  report.push(`filed: ${filed}, notifications: ${notified}`);
  const reportPath = join(OUT, `report-${ISSUE ? "issued" : "dry-run"}.tsv`);
  writeFileSync(reportPath, report.join("\n"));
  console.log(report.slice(0, 6).join("\n"));
  console.log(`\nreport: ${reportPath}`);
  console.log(`filed: ${filed}, notifications: ${notified}`);
}

async function all(db: ReturnType<typeof getServiceClient>, table: string, columns: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The same document /family/students/[id]/fsa prints, as a standalone page
 * for a PDF: provider block, dependents, care provided, certification.
 */
function renderLetter(letter: Letter): string {
  const issued = longDate(new Date().toISOString().slice(0, 10));
  const total = letter.lines.reduce((n, x) => n + x.paidCents, 0);
  const dependents = new Map<string, Child>();
  for (const line of letter.lines) for (const c of line.children) if (c.eligible) dependents.set(c.name, c);

  const lineRows = letter.lines
    .map((line) => {
      const eligible = line.children.filter((c) => c.eligible);
      const over = line.children.filter((c) => !c.eligible);
      const programs = line.activities.map((a) => esc(a.name.replace(/\s*\|\s*.*$/, ""))).join("<br>");
      const note = over.length
        ? `<div class="note">Also covers ${esc(over.map((c) => `${c.name} (age ${c.age})`).join(", "))}, who was ${FSA_AGE_LIMIT} or older; the registration record does not split this amount by child.</div>`
        : "";
      return `<tr>
        <td>${esc(eligible.map((c) => c.name).join(", "))}</td>
        <td>${programs}<div class="muted">Sawyer order #${esc(line.orderRef)}</div>${note}</td>
        <td class="dates">${shortDate(line.periodStart)} – ${shortDate(line.periodEnd)}</td>
        <td class="num">${formatCents(line.paidCents)}</td>
      </tr>`;
    })
    .join("");

  const excludedNote = letter.excluded.length
    ? `<p class="small">Not included above: ${esc(
        letter.excluded
          .map((x) => `${x.children.map((c) => c.name).join(", ") || "order #" + x.orderRef} (${x.holds.join("; ")})`)
          .join("; ")
      )}. Contact the office if you believe this is in error.</p>`
    : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(DOCUMENT_NAME)}</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; color: #000; font-size: 11pt; line-height: 1.4; margin: 0; }
  header { border-bottom: 2px solid #000; padding-bottom: 8px; }
  h1 { font-size: 18pt; margin: 0; }
  h2 { font-size: 9.5pt; text-transform: uppercase; letter-spacing: .06em; margin: 16px 0 4px; border-bottom: 1px solid #999; padding-bottom: 2px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th { text-align: left; border-bottom: 1px solid #000; padding: 4px 6px 4px 0; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; }
  td { vertical-align: top; padding: 6px 6px 6px 0; border-bottom: 1px solid #ddd; }
  td.num, th.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  td.dates { white-space: nowrap; }
  tr.total td { border-bottom: none; font-weight: bold; padding-top: 10px; }
  .muted { color: #555; font-size: 9pt; }
  .note { font-size: 9pt; margin-top: 3px; }
  .small { font-size: 9pt; color: #333; }
  .sig { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
  .sig .line { border-bottom: 1px solid #000; height: 28px; font-family: "Brush Script MT", "Segoe Script", cursive; font-size: 18pt; padding-left: 6px; }
  footer { margin-top: 24px; font-size: 8.5pt; color: #555; border-top: 1px solid #ddd; padding-top: 6px; }
</style></head><body>
<header>
  <h1>Dependent Care Provider Statement</h1>
  <div>For Dependent Care Flexible Spending Account (DCFSA) reimbursement</div>
  <div><strong>${esc(PROGRAM)}</strong> · Issued ${issued}</div>
</header>

<div class="grid">
  <div>
    <h2>Care provider</h2>
    <div><strong>${esc(org.tax.legalName)}</strong></div>
    <div>${esc(org.tax.addressLine1)}${org.tax.addressLine2 ? `, ${esc(org.tax.addressLine2)}` : ""}</div>
    <div>${esc(org.tax.city)}, ${esc(org.tax.state)} ${esc(org.tax.zip)}</div>
    <div>${esc(org.tax.phone)}</div>
    <div style="margin-top:4px"><strong>Taxpayer ID (EIN):</strong> ${esc(EIN)}</div>
  </div>
  <div>
    <h2>Paid by</h2>
    <div><strong>${esc(letter.guardianName)}</strong></div>
    <div>${esc(letter.familyName)}</div>
    <div>${esc(letter.email)}</div>
    <h2>Dependents</h2>
    ${[...dependents.values()]
      .map((c) => `<div>${esc(c.name)} — born ${longDate(c.dateOfBirth!)} (age ${c.age} at the end of the session)</div>`)
      .join("")}
  </div>
</div>

<h2>Care provided</h2>
<table>
  <thead><tr><th>Dependent</th><th>Program</th><th>Dates of care</th><th class="num">Amount paid</th></tr></thead>
  <tbody>
    ${lineRows}
    <tr class="total"><td colspan="3">Total paid to ${esc(org.shortName)}</td><td class="num">${formatCents(total)}</td></tr>
  </tbody>
</table>
<p class="small">Amounts are what ${esc(org.shortName)} received for each registration, as recorded in our registration system. Where a registration was paid partly with a tuition credit issued by another organization, only the portion paid to ${esc(org.shortName)} appears here.</p>
${excludedNote}

<p style="margin-top:18px">I certify that the dependent care services listed above were provided by ${esc(org.tax.legalName)} at the dates shown, that the dependents named were in our care during the program day, and that the amounts shown were paid to us.</p>

<div class="sig">
  <div>
    <div class="line">${esc(org.tax.signatoryName)}</div>
    <div class="small">${esc(org.tax.signatoryName)}, ${esc(org.tax.signatoryTitle)}<br>Signed electronically</div>
  </div>
  <div>
    <div class="line" style="font-family: Georgia, serif; font-size: 11pt; padding-top: 8px">${issued}</div>
    <div class="small">Date</div>
  </div>
</div>

<footer>Issued retroactively from ${esc(org.shortName)}'s registration records by ${esc(org.appName)}. Retain for your records. This statement is not tax advice; consult your FSA administrator or tax professional. Questions: ${esc(org.supportEmail)} · ${esc(org.tax.phone)}</footer>
</body></html>`;
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
