/**
 * Real-browser E2E for the casting v2 batch, against the LIVE site.
 * Full run-through: reset demo → cast everyone → submit → understudy
 * phase (yes → cover Anna with Leo → publish) → cast-list pills +
 * script breakdown → parent sees scenes on /casting → schedule filter
 * chips → cron job returns rehearsal-notice counts. Resets the demo
 * again at the end so Tony gets a pristine board.
 */
import puppeteer from "puppeteer-core";

const BASE = "https://novapa-family-hub.netlify.app";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const results = [];
const log = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

const setUser = async (page, userId) => {
  await page.setCookie({
    name: "novapa_session",
    value: userId,
    domain: "novapa-family-hub.netlify.app",
    path: "/",
    secure: true,
  });
};

try {
  const page = await browser.newPage();
  await setUser(page, "user-dana");

  const bodyIncludes = (text) =>
    page.evaluate((t) => document.body.innerText.includes(t), text);
  const waitForText = (text, ms = 30000) =>
    page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout: ms },
      text
    );
  const clickButton = (text) =>
    page.evaluate((t) => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.innerText.trim() === t || b.innerText.trim().startsWith(t)
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, text);
  // Role slots are divs; click the one whose heading matches exactly.
  const clickRoleSlot = (roleName) =>
    page.evaluate((t) => {
      const heading = [...document.querySelectorAll("p")].find(
        (p) => p.innerText.trim() === t
      );
      const slot = heading?.closest("div.rounded-xl");
      if (slot) {
        slot.click();
        return true;
      }
      return false;
    }, roleName);
  const settle = (ms = 2500) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ── 0. Pristine demo ── */
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const reset = await page.evaluate(async () => {
    const res = await fetch("/api/reset-demo", { method: "POST" });
    return res.status;
  });
  log("demo reset (staff)", reset === 200, `HTTP ${reset}`);

  /* ── 1. Cast the whole show ── */
  await page.goto(`${BASE}/admin/casting/prod-frozen`, { waitUntil: "domcontentloaded" });
  await waitForText("Submit casting");
  const plan = [
    ["Ava Martinez", "Elsa"],
    ["Lily Nguyen", "Anna"],
    ["Chidi Okafor", "Kristoff"],
    ["Leo Martinez", "Snow Chorus"],
  ];
  for (const [student, role] of plan) {
    // Retry until the assignment visibly lands as a chip inside a role
    // slot — server actions on cold serverless instances can take a while,
    // and a click during a re-render silently does nothing.
    let landed = false;
    for (let attempt = 0; attempt < 4 && !landed; attempt++) {
      await clickButton(student);
      await settle(600);
      await clickRoleSlot(role);
      try {
        await page.waitForFunction(
          (s) =>
            [...document.querySelectorAll("li")].some((li) =>
              li.innerText.includes(s)
            ),
          { timeout: 15000 },
          student
        );
        landed = true;
      } catch {
        await settle(1500);
      }
    }
    if (!landed) throw new Error(`${student} never landed on ${role}`);
  }
  await waitForText("Every student has a role", 20000);
  log("all four students cast", true);

  // Let the last assign's refresh fully apply before submitting — a submit
  // clicked mid-refresh gets its result discarded by React (server still
  // processes it). Real users are protected by the disabled state.
  await settle(6000);
  await clickButton("Submit casting & notify families");
  try {
    await waitForText("Casting submitted ✓", 45000);
  } catch {
    // Result discarded client-side; the server processed it — reload shows it.
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText("Casting submitted ✓", 45000);
  }
  log("casting submitted", true);

  /* ── 2. Understudy phase ── */
  await waitForText("Are you casting understudies?");
  log("understudy question appears after submit", true);
  await clickButton("Yes, cast understudies");
  await waitForText("Understudies — lead roles only");
  const holesBefore = await bodyIncludes("Hole");
  log("holes flagged before any cover", holesBefore);

  await clickButton("Leo Martinez");
  await settle(400);
  // Two "Anna" headings exist now (main grid + understudy section); the
  // understudy slot is the LAST one in document order.
  await page.evaluate(() => {
    const headings = [...document.querySelectorAll("p")].filter(
      (p) => p.innerText.trim() === "Anna"
    );
    headings[headings.length - 1]?.closest("div.rounded-xl")?.click();
  });
  await settle(3000);
  await page.waitForFunction(() => document.body.innerText.includes("Leo Martinez (u/s)"), { timeout: 60000 }).catch(() => {});
  const covered = await bodyIncludes("Leo Martinez (u/s)");
  log("Leo (u/s) covers Anna as understudy", covered);

  await settle(6000);
  await clickButton("Publish understudies & notify families");
  try {
    await waitForText("Understudies published ✓", 45000);
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText("Understudies published ✓", 45000);
  }
  log("understudies published with holes allowed", true);

  /* ── 3. Cast-list pills + script breakdown ── */
  await page.goto(`${BASE}/admin/cast-list/prod-frozen`, { waitUntil: "domcontentloaded" });
  await waitForText("Cast list — Frozen Jr.");
  log("cast list page renders", true);
  log("awaiting-confirmation state shown", await bodyIncludes("awaiting"));
  log("understudy listed on the role", await bodyIncludes("(u/s)"));
  log("script & music breakdown shown", await bodyIncludes("Script & music breakdown"));
  log("breakdown includes Let It Go", await bodyIncludes("Let It Go"));

  /* ── 4. Parent view: scenes + understudy child ── */
  await setUser(page, "user-sofia");
  await page.goto(`${BASE}/casting`, { waitUntil: "domcontentloaded" });
  await waitForText("Casting");
  log(
    "parent sees exact scene/song list",
    await bodyIncludes("Exactly what")
  );
  log(
    "understudy scenes marked 'rehearse & be ready'",
    await bodyIncludes("rehearse & be ready")
  );

  await page.goto(`${BASE}/schedule`, { waitUntil: "domcontentloaded" });
  await waitForText("Schedule");
  const chips = await bodyIncludes("Rehearsals");
  log("schedule has event-type filter chips", chips);

  /* ── 5. Cron: rehearsal notices ── */
  await setUser(page, "user-dana");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const cron = await page.evaluate(async () => {
    const res = await fetch("/api/jobs/casting-reminders", { method: "POST" });
    return { status: res.status, body: await res.json() };
  });
  log(
    "cron returns confirmation + rehearsal counts",
    cron.status === 200 &&
      "reminded" in cron.body &&
      "reminders" in cron.body &&
      "thanks" in cron.body,
    JSON.stringify(cron.body)
  );

  /* ── 6. Leave the demo pristine for Tony ── */
  const resetAfter = await page.evaluate(async () => {
    const res = await fetch("/api/reset-demo", { method: "POST" });
    return res.status;
  });
  log("demo reset back to seed", resetAfter === 200, `HTTP ${resetAfter}`);
} catch (error) {
  log("run aborted", false, String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
