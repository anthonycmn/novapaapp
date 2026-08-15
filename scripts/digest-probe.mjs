/** Capture the server-action error digest from a login attempt. */
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
try {
  const page = await browser.newPage();
  let digestBody = "";
  page.on("response", async (res) => {
    if (res.request().method() === "POST" && res.url().includes("/login")) {
      try {
        digestBody = `${res.status()} ${await res.text()}`;
      } catch {}
    }
  });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
  await page.type("#email", "sofia@example.com");
  await page.type("#password", "NovapaDemo2026!");
  await page.click("button[type=submit]");
  await new Promise((r) => setTimeout(r, 8000));
  console.log("URL after:", page.url());
  console.log("POST /login response:", digestBody.slice(0, 300) || "(none captured)");
} finally {
  await browser.close();
}
