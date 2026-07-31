/**
 * Captures the exact failing server-action POST from real Chrome, then
 * replays it with fetch and bisects headers until the 403 flips — to name
 * the precise thing Netlify's platform objects to.
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";

const BASE = "https://novapa-family-hub.netlify.app";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

let captured = null;

const page = await browser.newPage();
await page.setCookie({
  name: "novapa_session",
  value: "user-sofia",
  domain: "novapa-family-hub.netlify.app",
  path: "/",
  secure: true,
});

page.on("request", (request) => {
  if (request.method() === "POST" && request.url().includes("/casting")) {
    captured = {
      url: request.url(),
      headers: request.headers(),
      postData: request.postData() ?? null,
    };
  }
});

await page.goto(`${BASE}/casting`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.body.innerText.includes("Casting"), {
  timeout: 30000,
});
await page.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});

// Click Yes → Confirm on the first pending confirmation.
await page.evaluate(() => {
  const yes = [...document.querySelectorAll("button")].find((b) =>
    b.innerText.includes("Yes, that's correct")
  );
  yes?.click();
});
await new Promise((r) => setTimeout(r, 500));
await page.evaluate(() => {
  const confirm = [...document.querySelectorAll("button")].find(
    (b) => b.innerText.trim() === "Confirm"
  );
  confirm?.click();
});
await new Promise((r) => setTimeout(r, 5000));
await browser.close();

if (!captured) {
  console.log("NO POST CAPTURED — no pending confirmation on the page?");
  process.exit(1);
}

writeFileSync("scripts/captured-post.json", JSON.stringify(captured, null, 2));
console.log(`captured POST: ${captured.postData?.length ?? 0} bytes body`);
console.log(`header names: ${Object.keys(captured.headers).join(", ")}`);

/* ── replay exactly, then bisect ── */
async function replay(headers, label) {
  const response = await fetch(captured.url, {
    method: "POST",
    headers,
    body: captured.postData,
  });
  console.log(`${response.status}  ${label}`);
  return response.status;
}

const full = { ...captured.headers };
delete full["content-length"]; // fetch recomputes

const status = await replay(full, "FULL replay (all captured headers)");

if (status === 403) {
  // Drop one header at a time until it stops 403ing.
  for (const name of Object.keys(full)) {
    const without = { ...full };
    delete without[name];
    const s = await replay(without, `without ${name}`);
    if (s !== 403) {
      console.log(`\n>>> 403 disappears when removing: ${name}`);
    }
  }
} else {
  console.log("full replay did NOT 403 — difference is transport-level, not headers");
}
