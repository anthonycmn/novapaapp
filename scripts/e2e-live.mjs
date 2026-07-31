/**
 * Real-browser E2E against the LIVE site (not committed; diagnostic).
 * Walks the two flows Tony reported broken:
 *   1. casting board: click a student, click a role, verify assigned,
 *      reload, verify it PERSISTED
 *   2. rubric: score acting, save, reload, verify "1/3 scored" persisted
 * Uses system Chrome headless — the same engine families actually use.
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

try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(`console: ${message.text()}`);
  });
  await page.setCookie({
    name: "novapa_session",
    value: "user-dana",
    domain: "novapa-family-hub.netlify.app",
    path: "/",
    secure: true,
  });

  const bodyIncludes = (text) =>
    page.evaluate((t) => document.body.innerText.includes(t), text);
  const waitForText = async (text, ms = 30000) => {
    await page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      { timeout: ms },
      text
    );
  };
  // Buttons only, exact text — matching loose divs clicks a wrapper and
  // silently does nothing (the first run's failure mode).
  const clickButton = (text) =>
    page.evaluate((t) => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.innerText.trim() === t
      );
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, text);

  /* ── 1. Does the casting board finish rendering in real Chrome? ── */
  await page.goto(`${BASE}/admin/casting/prod-frozen`, { waitUntil: "domcontentloaded" });
  try {
    await waitForText("Submit casting", 30000);
    log("casting board streams & renders in real Chrome", true);
  } catch {
    const stuck = await bodyIncludes("Loading");
    log("casting board streams & renders in real Chrome", false, stuck ? "stuck on Loading skeleton" : "unknown state");
    throw new Error("board never rendered");
  }

  /* ── 2. Click-to-assign flow ── */
  // Reset: if Ava already holds a role from earlier testing, remove her first.
  const avaAssigned = await page.evaluate(() => {
    const chip = [...document.querySelectorAll("li")].find((li) =>
      li.innerText.includes("Ava Martinez")
    );
    const btn = chip?.querySelector("button[aria-label^='Remove']");
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (avaAssigned) await new Promise((r) => setTimeout(r, 2500));

  // Give hydration a moment — a click before React attaches handlers is
  // exactly the "nothing happened" a fast tester experiences.
  await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});

  const pickedStudent = await clickButton("Ava Martinez");
  log("student chip clickable", pickedStudent);
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes("selected — now tap a role"),
      { timeout: 10000 }
    );
    log("chip click registers (hydrated)", true);
  } catch {
    const pressed = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => b.innerText.trim() === "Ava Martinez"
      );
      return btn?.getAttribute("aria-pressed");
    });
    log(
      "chip click registers (hydrated)",
      false,
      `aria-pressed=${pressed}; pageErrors=${JSON.stringify(pageErrors.slice(0, 3))}`
    );
    throw new Error("click did not register");
  }

  // Click the Elsa role card.
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div.rounded-xl')];
    const elsa = cards.find(
      (d) => d.querySelector("p")?.innerText === "Elsa"
    );
    elsa?.click();
  });

  // Server action + revalidate round-trip.
  await page.waitForFunction(
    () => {
      const cards = [...document.querySelectorAll('div.rounded-xl')];
      const elsa = cards.find((d) => d.querySelector("p")?.innerText === "Elsa");
      return elsa && elsa.innerText.includes("Ava Martinez");
    },
    { timeout: 20000 }
  );
  log("clicking a role assigns the student (UI updates)", true);

  // The decisive part: does it SURVIVE a full reload (fresh serverless instance)?
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForText("Submit casting", 30000);
  const persisted = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('div.rounded-xl')];
    const elsa = cards.find((d) => d.querySelector("p")?.innerText === "Elsa");
    return Boolean(elsa && elsa.innerText.includes("Ava Martinez"));
  });
  log("assignment PERSISTS after reload", persisted);

  // Clean up: put the board back how we found it.
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll("li")].find((li) =>
      li.innerText.includes("Ava Martinez")
    );
    chip?.querySelector("button[aria-label^='Remove']")?.click();
  });
  await new Promise((r) => setTimeout(r, 2500));

  /* ── 3. Rubric save flow ── */
  await page.goto(`${BASE}/admin/auditions/prod-frozen`, { waitUntil: "domcontentloaded" });
  await waitForText("Rubric (", 30000);
  log("audition roster renders in real Chrome", true);

  // Open the first student's rubric.
  await page.evaluate(() => document.querySelector("details summary")?.click());
  await new Promise((r) => setTimeout(r, 500));

  // Score all four acting criteria at 4, add a note.
  const scored = await page.evaluate(() => {
    const keys = ["characterization", "projection", "emotional_range", "direction"];
    let clicked = 0;
    for (const key of keys) {
      const radio = document.querySelector(`input[name="score_${key}"][value="4"]`);
      if (radio) {
        radio.click();
        clicked++;
      }
    }
    const notes = document.querySelector('textarea[name="notes"]');
    if (notes) {
      notes.value = "E2E check note";
      notes.dispatchEvent(new Event("input", { bubbles: true }));
    }
    return clicked;
  });
  log("rubric radios fillable", scored === 4, `${scored}/4 criteria`);

  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.innerText.includes("Save Acting rubric")
    );
    btn?.click();
  });
  await waitForText("Saved ✓", 20000);
  log("rubric save action completes", true);

  // Reload — the count must show 1/3 from a fresh server render.
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForText("Rubric (", 30000);
  const rubricPersisted = await bodyIncludes("Rubric (1/3");
  log("rubric PERSISTS after reload", rubricPersisted);
} catch (error) {
  console.error("E2E error:", error.message);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}
