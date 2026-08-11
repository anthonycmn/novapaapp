/**
 * Live E2E for weekly private-lesson booking: parent books a slot for
 * their child, it shows as "yours", lands on the family calendar, another
 * family sees only "taken", staff roster shows the student, cancel frees
 * the slot. Leaves the demo pristine.
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
  const bodyIncludes = (text) =>
    page.evaluate((t) => document.body.innerText.includes(t), text);
  const waitForText = (text, ms = 45000) =>
    page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout: ms },
      text
    );
  const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ── reset demo as staff ── */
  await setUser(page, "user-dana");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const reset = await page.evaluate(async () =>
    (await fetch("/api/reset-demo", { method: "POST" })).status
  );
  log("demo reset", reset === 200, `HTTP ${reset}`);

  /* ── parent books a weekly slot ── */
  await setUser(page, "user-sofia");
  await page.goto(`${BASE}/store/lessons`, { waitUntil: "domcontentloaded" });
  await waitForText("Voice with Marcus Lee");
  log("lessons page shows teachers & slots", true);

  // Tap the first open Tuesday slot, then complete the booking form.
  // Retry: a click during hydration is silently lost.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find((b) =>
        b.innerText.startsWith("Tuesdays 4:30 PM")
      );
      btn?.click();
    });
    await settle(2000);
    if (await bodyIncludes("every week with")) break;
  }
  await waitForText("every week with");
  await page.select("select[name=studentId]", "stu-ava");
  await page.type("textarea[name=goals]", "Belting for the spring show");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.innerText.startsWith("Book Tuesdays")
    );
    btn?.click();
  });
  try {
    await waitForText("Your weekly lessons", 45000);
  } catch {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForText("Your weekly lessons", 45000);
  }
  log("weekly slot booked", true);
  log("next lesson shown", await bodyIncludes("Next lesson:"));

  /* ── on the family calendar ── */
  await page.goto(`${BASE}/schedule`, { waitUntil: "domcontentloaded" });
  await waitForText("Schedule");
  await settle(1500);
  log("lesson on family calendar", await bodyIncludes("Voice lesson — Marcus Lee"));

  /* ── another family sees taken, no name ── */
  await setUser(page, "user-minh");
  await page.goto(`${BASE}/store/lessons`, { waitUntil: "domcontentloaded" });
  await waitForText("Voice with Marcus Lee");
  const takenNoName = await page.evaluate(() => {
    const text = document.body.innerText;
    return text.includes("taken") && !text.includes("Ava");
  });
  log("other family sees 'taken', never the name", takenNoName);

  /* ── staff roster shows the student ── */
  await setUser(page, "user-dana");
  await page.goto(`${BASE}/admin/lessons`, { waitUntil: "domcontentloaded" });
  await waitForText("Lesson roster");
  log("staff roster shows student & family", await bodyIncludes("Ava Martinez"));
  log("goals visible to staff", await bodyIncludes("Belting for the spring show"));

  /* ── parent cancels; slot frees ── */
  await setUser(page, "user-sofia");
  await page.goto(`${BASE}/store/lessons`, { waitUntil: "domcontentloaded" });
  await waitForText("Cancel weekly slot");
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.innerText.trim() === "Cancel weekly slot"
    );
    btn?.click();
  });
  await settle(6000);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForText("Voice with Marcus Lee");
  const freed = await page.evaluate(
    () => !document.body.innerText.includes("Your weekly lessons")
  );
  log("cancel frees the slot", freed);

  /* ── leave pristine ── */
  await setUser(page, "user-dana");
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  const resetAfter = await page.evaluate(async () =>
    (await fetch("/api/reset-demo", { method: "POST" })).status
  );
  log("demo reset back to seed", resetAfter === 200, `HTTP ${resetAfter}`);
} catch (error) {
  log("run aborted", false, String(error));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
