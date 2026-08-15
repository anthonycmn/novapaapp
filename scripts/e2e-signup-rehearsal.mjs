/**
 * Signup-flow rehearsal against the real backend.
 *  1. UI signup for a TEST family's guardian email → "check your email"
 *  2. (simulate the email click via admin confirm — mailbox is fake)
 *  3. UI sign-in → auto-provisioned profile → dashboard shows the family
 *  4. UI sign-in for a confirmed account with NO family registration →
 *     bounced with the "no-family" message, no profile created
 * Creates its own fixtures (ZZ Signup Test family) and deletes them after.
 *
 * Run with env: node scripts/e2e-signup-rehearsal.mjs [BASE]
 */
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const BASE = process.argv[2] ?? "http://localhost:3100";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PASSWORD = "SignupTest2026!aa";
const FAMILY_EMAIL = "fh-signup-test-family@example.com";
const STRANGER_EMAIL = "fh-signup-test-stranger@example.com";

const hub = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false }, db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA ?? "family_hub" } }
);

const results = [];
const log = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function cleanup() {
  const { data } = await hub.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data?.users ?? []) {
    if ([FAMILY_EMAIL, STRANGER_EMAIL].includes(user.email ?? "")) {
      await hub.auth.admin.deleteUser(user.id); // profile cascades
    }
  }
  await hub.from("families").delete().eq("name", "ZZ Signup Test Family");
}

const familyId = randomUUID();
async function fixtures() {
  const { error } = await hub.from("families").insert({ id: familyId, name: "ZZ Signup Test Family" });
  if (error) throw new Error(`fixture family: ${error.message}`);
  const { error: gError } = await hub.from("guardians").insert({
    id: randomUUID(),
    family_id: familyId,
    full_name: "Signup Testparent",
    email: FAMILY_EMAIL,
    is_primary: true,
  });
  if (gError) throw new Error(`fixture guardian: ${gError.message}`);
  const { error: sError } = await hub.from("students").insert({
    id: randomUUID(),
    family_id: familyId,
    first_name: "Testkid",
    last_name: "Signup",
    date_of_birth: "2014-01-01",
  });
  if (sError) throw new Error(`fixture student: ${sError.message}`);
}

async function adminConfirm(email) {
  const { data } = await hub.auth.admin.listUsers({ perPage: 1000 });
  const user = (data?.users ?? []).find((u) => u.email === email);
  if (!user) throw new Error(`no auth user for ${email}`);
  const { error } = await hub.auth.admin.updateUserById(user.id, { email_confirm: true });
  if (error) throw new Error(`confirm ${email}: ${error.message}`);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  await cleanup();
  await fixtures();

  const page = await browser.newPage();
  const bodyIncludes = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);

  /* 1. signup via UI */
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle2" });
  log("signup page renders", Boolean(await page.$("#email")));
  await page.type("#email", FAMILY_EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click("button[type=submit]"),
  ]);
  log("signup lands on check-your-email", await bodyIncludes("Check your email"));

  /* 2. unconfirmed sign-in is refused */
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", FAMILY_EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click("button[type=submit]"),
  ]);
  log("unconfirmed sign-in refused", page.url().includes("error="));

  /* 3. confirm (simulating the email click), sign in, see the family */
  await adminConfirm(FAMILY_EMAIL);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", FAMILY_EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click("button[type=submit]"),
  ]);
  log("confirmed sign-in lands on dashboard", page.url().includes("/dashboard"));
  await page.waitForFunction(
    () => document.body.innerText.includes("Testkid"),
    { timeout: 30000 }
  );
  log("auto-linked family: dashboard shows their child", true);
  const { data: prof } = await hub
    .from("profiles").select("role, family_id").eq("email", FAMILY_EMAIL).single();
  log(
    "profile provisioned as parent of the right family",
    prof?.role === "parent" && prof?.family_id === familyId
  );

  const client = await page.createCDPSession();
  await client.send("Network.clearBrowserCookies");

  /* 4. stranger with no registration */
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle2" });
  await page.type("#email", STRANGER_EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click("button[type=submit]"),
  ]);
  await adminConfirm(STRANGER_EMAIL);
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", STRANGER_EMAIL);
  await page.type("#password", PASSWORD);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
    page.click("button[type=submit]"),
  ]);
  log("stranger bounced with no-family message", page.url().includes("no-family"));
  const { data: strangerProf } = await hub
    .from("profiles").select("id").eq("email", STRANGER_EMAIL).maybeSingle();
  log("no profile created for the stranger", !strangerProf);
} catch (error) {
  log("run aborted", false, String(error).slice(0, 200));
} finally {
  await cleanup();
  console.log("fixtures cleaned up");
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
