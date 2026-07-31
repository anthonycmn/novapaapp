import puppeteer from "puppeteer-core";
const BASE = "https://novapa-family-hub.netlify.app";
const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setCookie({ name: "novapa_session", value: "user-dana", domain: "novapa-family-hub.netlify.app", path: "/", secure: true });

// Board is already fully cast from the last run (submit persisted server-side
// but demo was reset and re-cast by _debug3; board is cast, unsubmitted).
await page.goto(`${BASE}/admin/casting/prod-frozen`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.includes("Submit casting") || document.body.innerText.includes("Casting submitted"), { timeout: 60000 });
const already = await page.evaluate(() => document.body.innerText.includes("Casting submitted"));
console.log("already submitted:", already);
if (!already) {
  const events = [];
  const t0 = Date.now();
  page.on("request", (req) => { if (req.method() === "POST") events.push({ t: Date.now()-t0, ev: "req", url: req.url().slice(-30), next: req.headers()["next-action"] ? "action" : "" }); });
  page.on("response", async (res) => {
    if (res.request().method() !== "POST") return;
    let body = "";
    try { body = (await res.text()).slice(0, 300); } catch (e) { body = "unreadable: " + e.message; }
    events.push({ t: Date.now()-t0, ev: "res", status: res.status(), ct: res.headers()["content-type"], body });
  });
  page.on("requestfailed", (req) => { if (req.method() === "POST") events.push({ t: Date.now()-t0, ev: "fail", err: req.failure()?.errorText }); });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.innerText.includes("Submit casting"));
    b.click();
  });
  await new Promise((r) => setTimeout(r, 60000));
  console.log(JSON.stringify(events, null, 1));
  console.log("submitted shown:", await page.evaluate(() => document.body.innerText.includes("Casting submitted")));
}
await browser.close();
