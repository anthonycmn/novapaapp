/**
 * Dress rehearsal: the app running in SUPABASE mode (real database, real
 * password sign-in) driven end-to-end in a real browser.
 * BASE defaults to the local prod server; pass a URL arg for the live site.
 */
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PASSWORD = "NovapaDemo2026!";

const results = [];
const log = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

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

  async function login(email, password = PASSWORD) {
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
    await page.evaluate(() => {
      const emailInput = document.querySelector("#email");
      const passwordInput = document.querySelector("#password");
      if (emailInput) emailInput.value = "";
      if (passwordInput) passwordInput.value = "";
    });
    await page.type("#email", email);
    await page.type("#password", password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }),
      page.click("button[type=submit]"),
    ]);
  }
  async function logout() {
    await page.evaluate(async () => {
      // The sign-out form exists in the shell; call the cookie delete via UI
      // if present, otherwise clear cookies.
    });
    const client = await page.createCDPSession();
    await client.send("Network.clearBrowserCookies");
  }

  /* 1. Login page shows the password field (supabase mode). */
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  log("password field shown in supabase mode", Boolean(await page.$("#password")));
  log("demo account list hidden", !(await bodyIncludes("Demo accounts")));

  /* 2. Wrong password rejected. */
  await login("sofia@example.com", "wrong-password-123");
  let rejected = page.url().includes("bad-credentials");
  if (!rejected) {
    try { await waitForText("don't match", 15000); rejected = true; } catch {}
  }
  log("wrong password rejected", rejected);

  /* 3. Forged cookie rejected. */
  await page.setCookie({
    name: "novapa_session",
    value: "some-forged-user-id",
    url: BASE,
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle2" });
  log(
    "forged session cookie bounced to login",
    page.url().includes("/login")
  );
  await logout();

  /* 4. Real parent login → real data. */
  await login("sofia@example.com");
  log("parent password login lands on dashboard", page.url().includes("/dashboard"));
  await waitForText("Ava");
  log("dashboard shows her real children", await bodyIncludes("Leo"));

  /* 5. Family pages against the real backend. */
  await page.goto(`${BASE}/casting`, { waitUntil: "networkidle2" });
  await waitForText("Casting");
  log("casting page renders on supabase", true);
  await page.goto(`${BASE}/store/lessons`, { waitUntil: "networkidle2" });
  await waitForText("Marcus Lee");
  log("lessons page shows real slots", await bodyIncludes("Voice with Marcus Lee"));
  await page.goto(`${BASE}/schedule`, { waitUntil: "networkidle2" });
  await waitForText("Schedule");
  log("schedule renders", true);
  await logout();

  /* 6. Staff login → staff tools. */
  await login("dana@example.com");
  log("staff login works", page.url().includes("/dashboard"));
  await page.goto(`${BASE}/admin/lessons`, { waitUntil: "networkidle2" });
  await waitForText("Lesson roster");
  log("staff lesson roster renders", true);
  await settle(500);

  /* 7. Family privacy at the page level: sofia's session can't see admin? */
  await logout();
  await login("sofia@example.com");
  await page.goto(`${BASE}/admin/lessons`, { waitUntil: "networkidle2" });
  log(
    "parent bounced from staff pages",
    !page.url().includes("/admin") || (await bodyIncludes("Sign in"))
  );
} catch (error) {
  log("run aborted", false, String(error).slice(0, 200));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
