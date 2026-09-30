import "server-only";
import { getServiceClient } from "@/lib/api/supabase/client";
import { getProvider } from "@/lib/api";
import { getRegistrationProvider } from "@/lib/api/registration";
import { provisionNewWebsiteAccounts } from "@/lib/api/registration/provision";
import { jobActorId } from "@/lib/jobs/actor";
import { issueLoginLink } from "@/lib/auth/login-links";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { button, callout, esc, h2, p, renderEmailShell, section } from "@/lib/email/template";

/**
 * After a family pays through the front door (CJ, 30 Sep 2026): "after they
 * check out an email is sent to them to sign into the portal that gives them
 * access to their portal."
 *
 * Until now a first-time family could not sign in for up to fifteen minutes,
 * because their family and guardian rows appear only when the scheduled sync
 * runs, and a guest checkout on novapa.org made no sign-in account at all.
 * This closes both, the moment the registration webhook tells us they paid:
 *
 *   1. make (or find) their sign-in account, email already confirmed — they
 *      proved the address by paying from it and by opening the link;
 *   2. run the provisioning + sync now, bounded so a slow run never holds up
 *      the receipt (the link's own sign-in retries it, below);
 *   3. mint two one-time links: one for the receipt's button, one for the
 *      separate welcome email (CJ: "both"). A link is spent by one press, so
 *      each email gets its own;
 *   4. send the welcome email — once per checkout. A class-and-show cart is
 *      two payments and two webhook calls; the second finds the first's
 *      welcome by its cart id and does not send another.
 */

const PROVISION_BUDGET_MS = 5_000;

/** Provision + sync, as the 15-minute job does it. Never throws. */
export async function provisionNow(): Promise<boolean> {
  try {
    const actorId = await jobActorId();
    if (!actorId) return false;
    await provisionNewWebsiteAccounts();
    const snapshot = await getRegistrationProvider().fetchSnapshot();
    await getProvider().syncRegistration(actorId, snapshot, "webhook");
    return true;
  } catch (e) {
    console.error("front door: provisionNow failed:", e);
    return false;
  }
}

async function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | "late"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<"late">((resolve) => {
    timer = setTimeout(() => resolve("late"), ms);
  });
  try {
    return await Promise.race([work, late]);
  } finally {
    clearTimeout(timer);
  }
}

/** The sign-in account for this address, made if missing. */
export async function ensureAuthUser(email: string, fullName: string): Promise<string> {
  const db = getServiceClient();
  const address = email.trim().toLowerCase();
  const { data, error } = await db.auth.admin.createUser({
    email: address,
    email_confirm: true,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (data?.user?.id) return data.user.id;
  if (error && !/already|registered|exists/i.test(error.message)) {
    throw new Error(`Could not make a sign-in account: ${error.message}`);
  }
  // Already has one: a profile row names it, or failing that the auth list.
  const { data: prof } = await db.from("profiles").select("id").ilike("email", address).limit(1).maybeSingle();
  if (prof?.id) return String(prof.id);
  for (let page = 1; page < 50; page++) {
    const { data: list, error: listErr } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (listErr) throw new Error(`listUsers: ${listErr.message}`);
    const hit = list.users.find((u) => (u.email ?? "").toLowerCase() === address);
    if (hit) return hit.id;
    if (list.users.length < 1000) break;
  }
  throw new Error("The address has an account that could not be found");
}

async function welcomeAlreadySent(cartId: string | null): Promise<boolean> {
  if (!cartId) return false;
  const { count } = await getServiceClient()
    .from("login_links")
    .select("id", { count: "exact", head: true })
    .eq("note", `front-door welcome cart:${cartId}`);
  return (count ?? 0) > 0;
}

export interface WelcomeResult {
  receiptUrl: string;
  welcomeSent: boolean;
}

export async function welcomeFamily(input: {
  email: string;
  parentName: string;
  cartId: string | null;
}): Promise<WelcomeResult> {
  const email = input.email.trim().toLowerCase();
  const userId = await ensureAuthUser(email, input.parentName);

  await withinBudget(provisionNow(), PROVISION_BUDGET_MS);

  const receipt = await issueLoginLink({
    userId,
    email,
    issuedBy: "front-door",
    note: input.cartId ? `front-door receipt cart:${input.cartId}` : "front-door receipt",
  });

  let welcomeSent = false;
  if (!(await welcomeAlreadySent(input.cartId))) {
    const link = await issueLoginLink({
      userId,
      email,
      issuedBy: "front-door",
      note: input.cartId ? `front-door welcome cart:${input.cartId}` : "front-door welcome",
    });
    const mail = welcomeEmail({ parentName: input.parentName, url: link.url });
    const sent = await getEmailDeliveryProvider()
      .send({ to: email, category: "front-door-welcome", subject: mail.subject, text: mail.text, html: mail.html })
      .catch((e) => {
        console.error("front door: welcome email failed:", e);
        return { ok: false, id: "" };
      });
    welcomeSent = sent.ok;
  }
  return { receiptUrl: receipt.url, welcomeSent };
}

/** The welcome email. Exported for the test and for a preview render. */
export function welcomeEmail({ parentName, url }: { parentName: string; url: string }) {
  const first = (parentName || "").trim().split(/\s+/)[0] || "";
  const hello = first ? `Hi ${first},` : "Hello,";
  const subject = "Welcome to your NoVAPA Parent Portal";
  const text = [
    hello,
    "",
    "You're registered, and your Parent Portal is ready. It is where you'll find your",
    "student's schedule, rehearsal and class updates, payments, forms and messages from us.",
    "",
    `Open your portal (this link signs you in, once): ${url}`,
    "",
    "The link works for 7 days. Once you're in you can choose a password, or just use",
    "\"Email me a code\" on the sign-in page any time.",
    "",
    "Your receipt is in a separate email.",
    "",
    "— NoVAPA",
  ].join("\n");
  const html = renderEmailShell({
    preheader: "Your Parent Portal is ready — one button signs you in.",
    content:
      section(
        h2("Your Parent Portal is ready") +
          p(esc(hello)) +
          p(
            "You're registered. Your Parent Portal is where you'll find your student's schedule, " +
              "rehearsal and class updates, payments, forms and messages from us."
          ) +
          button("Open your Parent Portal", url) +
          callout(
            "This button signs you in, once, and works for 7 days. Once you're in you can choose a " +
              "password — or skip it and sign in with a code by email next time."
          ) +
          p("Your receipt is in a separate email."),
        { first: true }
      ),
  });
  return { subject, text, html };
}
