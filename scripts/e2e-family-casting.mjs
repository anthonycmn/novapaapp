/**
 * Reproduces Tony's report: family-side casting confirmation errors on
 * accept AND on name change. Runs the full pipeline in real Chrome against
 * the live site and captures the exact error text.
 */
import puppeteer from "puppeteer-core";

const BASE = "https://novapa-family-hub.netlify.app";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

const report = [];
const log = (s) => {
  report.push(s);
  console.log(s);
};

async function pageAs(user) {
  const page = await browser.newPage();
  page.on("pageerror", (e) => log(`  [pageerror ${user}] ${String(e).slice(0, 200)}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`  [console ${user}] ${m.text().slice(0, 250)}`);
  });
  // Server actions POST back to the page URL — capture those responses.
  page.on("response", async (response) => {
    if (response.request().method() !== "POST") return;
    let body = "";
    try {
      body = (await response.text()).slice(0, 300);
    } catch {
      body = "(unreadable)";
    }
    const headers = response.headers();
    log(
      `  [POST ${user}] ${response.status()} ${response.url().replace(BASE, "")} :: ${body.replace(/\n/g, " ")}`
    );
    if (response.status() >= 400) {
      log(
        `  [POST ${user} headers] server=${headers["server"]} x-nf=${headers["x-nf-request-id"] ?? "-"} allow=${headers["x-action-forbidden"] ?? "-"} ct=${headers["content-type"]}`
      );
      const req = response.request();
      const reqHeaders = req.headers();
      log(
        `  [POST ${user} request] origin=${reqHeaders["origin"] ?? "-"} next-action=${(reqHeaders["next-action"] ?? "-").slice(0, 20)}`
      );
    }
  });
  await page.setCookie({
    name: "novapa_session",
    value: user,
    domain: "novapa-family-hub.netlify.app",
    path: "/",
    secure: true,
  });
  return page;
}

const waitText = (page, text, ms = 30000) =>
  page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, text);

const clickButton = (page, text) =>
  page.evaluate((t) => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.innerText.trim() === t || b.innerText.trim().startsWith(t)
    );
    if (btn) {
      btn.click();
      return btn.innerText.trim();
    }
    return null;
  }, text);

/** Any visible alert/error text on the page. */
const errorText = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="alert"]')]
      .map((e) => e.innerText)
      .filter(Boolean)
      .join(" | ")
  );

try {
  /* ── Stage 1: as Dana, ensure casting is submitted ── */
  const dana = await pageAs("user-dana");
  await dana.goto(`${BASE}/admin/casting/prod-frozen`, { waitUntil: "domcontentloaded" });
  await waitText(dana, "Casting —");
  await dana.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});

  const alreadySubmitted = await dana.evaluate(() =>
    document.body.innerText.includes("Casting submitted")
  );
  log(`board already submitted: ${alreadySubmitted}`);

  if (!alreadySubmitted) {
    const plan = [
      ["Ava Martinez", "Elsa"],
      ["Liên", "Anna"], // preferred name Lily renders as "Lily Nguyen"
      ["Chidi Okafor", "Kristoff"],
      ["Leo Martinez", "Snow Chorus"],
    ];
    for (const [student, role] of plan) {
      const clicked = await clickButton(dana, student);
      if (!clicked) {
        log(`  could not find chip starting with "${student}" — may be assigned already`);
        continue;
      }
      await waitText(dana, "selected — now tap a role", 10000);
      await dana.evaluate((r) => {
        const cards = [...document.querySelectorAll("div.rounded-xl")];
        const card = cards.find((d) => d.querySelector("p")?.innerText === r);
        card?.click();
      }, role);
      await dana
        .waitForFunction(
          (r, s) => {
            const cards = [...document.querySelectorAll("div.rounded-xl")];
            const card = cards.find((d) => d.querySelector("p")?.innerText === r);
            return card && card.innerText.includes(s.split(" ")[0]);
          },
          { timeout: 20000 },
          role,
          student
        )
        .catch(() => log(`  assign ${student} -> ${role} did not reflect`));
    }

    await clickButton(dana, "Submit casting & notify families");
    try {
      await waitText(dana, "Casting submitted", 30000);
      log("casting submitted OK");
    } catch {
      log(`SUBMIT FAILED — alert: ${await errorText(dana)}`);
    }
  }
  await dana.close();

  /* ── Stage 2: as Sofia, accept the role ── */
  const sofia = await pageAs("user-sofia");
  await sofia.goto(`${BASE}/casting`, { waitUntil: "domcontentloaded" });
  await waitText(sofia, "Casting");
  await sofia.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});

  const sofiaState = await sofia.evaluate(() => document.body.innerText.slice(0, 600));
  log(`--- Sofia /casting sees ---\n${sofiaState}\n---`);

  if (await sofia.evaluate(() => document.body.innerText.includes("Is “"))) {
    await clickButton(sofia, "Yes, that's correct");
    await new Promise((r) => setTimeout(r, 400));
    await clickButton(sofia, "Confirm");
    await new Promise((r) => setTimeout(r, 6000));
    const ok = await sofia.evaluate(() =>
      document.body.innerText.includes("Playbill will print")
    );
    const err = await errorText(sofia);
    log(`ACCEPT: success=${ok} alert="${err}"`);
  } else {
    log("Sofia has no pending confirmation form (already answered or none)");
  }
  await sofia.close();

  /* ── Stage 3: as Minh, change the name ── */
  const minh = await pageAs("user-minh");
  await minh.goto(`${BASE}/casting`, { waitUntil: "domcontentloaded" });
  await waitText(minh, "Casting");
  await minh.waitForNetworkIdle({ idleTime: 800, timeout: 20000 }).catch(() => {});

  if (await minh.evaluate(() => document.body.innerText.includes("needs adjusting"))) {
    await clickButton(minh, "No, it needs adjusting");
    await new Promise((r) => setTimeout(r, 400));
    await minh.evaluate(() => {
      const input = document.querySelector('input[name="playbillName"]');
      if (input) {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value"
        ).set;
        setter.call(input, "Lily Nguyễn");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await clickButton(minh, "Confirm");
    await new Promise((r) => setTimeout(r, 6000));
    const ok = await minh.evaluate(() =>
      document.body.innerText.includes("Playbill will print")
    );
    const err = await errorText(minh);
    log(`NAME CHANGE: success=${ok} alert="${err}"`);

    /* ── Stage 4: request feedback (partial rubrics) ── */
    if (ok) {
      await clickButton(minh, "Request audition feedback");
      await new Promise((r) => setTimeout(r, 6000));
      const feedbackState = await minh.evaluate(() => {
        const t = document.body.innerText;
        return {
          hasRubric: t.includes("Audition feedback"),
          emptyMsg: t.includes("hasn't completed rubrics"),
        };
      });
      log(`FEEDBACK: ${JSON.stringify(feedbackState)}`);
    }
  } else {
    log("Minh has no pending confirmation form");
  }
  await minh.close();
} catch (error) {
  log(`SCRIPT ERROR: ${error.message}`);
} finally {
  await browser.close();
}
