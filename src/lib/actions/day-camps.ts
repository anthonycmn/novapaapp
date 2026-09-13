"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registration } from "@/config/registration";
import { DAY_CAMP_PACKS, isDayCampPack } from "@/config/day-camps";
import { getProvider } from "@/lib/api";
import { getRegistrationProvider } from "@/lib/api/registration";
import {
  fetchPunchCards,
  type PunchCard,
  type PunchCardBoard,
  type PunchCardDay,
  type PunchCardSession,
} from "@/lib/api/registration/punch-card";
import {
  getServiceClient,
  getWebsiteAnonClient,
  getWebsiteReadClient,
  isSupabaseConfigured,
} from "@/lib/api/supabase/client";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import { jobActorId } from "@/lib/jobs/actor";

/**
 * The punch card's two actions.
 *
 * CJ, 13 Sep 2026: "they can assign their credits based on what they bought
 * to the days — when this is done, the day camps curriculum page includes
 * them on the roster. Also allow them to buy more credits or individual
 * days… Click click click — no friction and easy to use."
 *
 * SPENDING A CREDIT NEVER TOUCHES THE LEDGER FROM HERE. The portal does what
 * a parent on novapa.org does: takes a hold (`acquire_hold_guest`, with the
 * anon key, judged by the checkout's own capacity rules) and posts it to the
 * checkout's own endpoint with `confirm_free: true`. reg-pay then writes the
 * order, bumps `sold`, deducts the credit through `apply_credit_events`, and
 * sends the family its own confirmation email — the receipt for their own
 * action, not outreach, and not something to send twice from here. The staff
 * portal's roster reads that order row live, so the child is on the day's
 * register the moment this returns. Why not call `apply_credit_events`
 * ourselves: a redemption without an order is a credit spent on nothing.
 *
 * PAYING never happens here at all. The cart is validated and the family is
 * sent to the website's checkout with the days and the child already chosen
 * (`?activity=…&kid=…&back=portal`); Stripe stays where it is.
 */

const bookSchema = z.object({
  studentId: z.string().min(1),
  activityIds: z.array(z.number().int().positive()).min(1).max(12),
});

export interface BookWithCreditsResult {
  ok: boolean;
  message: string;
  /** What was booked, for the confirmation line. */
  booked?: { activityId: number; name: string; date: string }[];
  creditsLeft?: number;
}

const isMock = () => (process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase";

/** The card for this student on this family's board, or a reason there is none. */
function cardFor(
  board: PunchCardBoard,
  studentId: string
): { card: PunchCard } | { error: string } {
  if (board.status !== "ok") {
    return { error: "We can't reach the registration system right now. Nothing was booked — please try again in a minute." };
  }
  const card = board.cards.find((c) => c.student.id === studentId);
  if (!card) return { error: "That student isn't in your family." };
  if (!card.camper) {
    return { error: `We can't find ${card.student.preferredName ?? card.student.firstName} in the registration system yet, so nothing can be booked here. Message the office and we'll link them.` };
  }
  return { card };
}

/**
 * Each requested activity as a bookable session on an open, unbooked, future
 * date — one per date — or the first reason it is not.
 */
function pickSessions(
  card: PunchCard,
  activityIds: number[]
): { picks: { day: PunchCardDay; session: PunchCardSession }[] } | { error: string } {
  const unique = [...new Set(activityIds)];
  const picks: { day: PunchCardDay; session: PunchCardSession }[] = [];
  const datesSeen = new Set<string>();
  for (const activityId of unique) {
    const day = card.days.find((d) => d.sessions.some((s) => s.activityId === activityId));
    const session = day?.sessions.find((s) => s.activityId === activityId);
    if (!day || !session) return { error: "One of those days isn't a day camp we're offering." };
    if (day.past) return { error: `${day.label} has already happened.` };
    // Idempotency: a double click must not book twice. Booked is read fresh
    // from order_items on every call, so a second request after the first
    // succeeded sees the row and stops here without touching the network.
    if (day.booked) {
      return {
        error: `${card.student.preferredName ?? card.student.firstName} is already booked on ${day.label} (${day.booked.name}).`,
      };
    }
    if (!session.bookable || (session.remaining != null && session.remaining <= 0)) {
      return { error: `${session.name} on ${day.label} is full.` };
    }
    if (datesSeen.has(day.date)) return { error: `Pick one session per day — ${day.label} was chosen twice.` };
    datesSeen.add(day.date);
    picks.push({ day, session });
  }
  return { picks };
}

export async function bookWithCreditsAction(
  input: { studentId: string; activityIds: number[] }
): Promise<BookWithCreditsResult> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, message: "Sign in first." };
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick at least one day." };

  // 1–2. Guardian owns the student; the student has a camper; re-read credits
  // and the catalog fresh — the board is built from live rows on every call.
  const board = await fetchPunchCards(user.familyId);
  const found = cardFor(board, parsed.data.studentId);
  if ("error" in found) return { ok: false, message: found.error };
  const { card } = found;
  const camper = card.camper!;
  const childName = card.student.preferredName ?? card.student.firstName;

  const chosen = pickSessions(card, parsed.data.activityIds);
  if ("error" in chosen) return { ok: false, message: chosen.error };
  const { picks } = chosen;
  if (picks.length > card.credits.day) {
    return {
      ok: false,
      message:
        card.credits.day === 0
          ? `${childName} has no credits left. Add days to the cart instead, or buy a pack.`
          : `${childName} has ${card.credits.day} credit${card.credits.day === 1 ? "" : "s"} left, and you picked ${picks.length} days.`,
    };
  }
  if (!camper.email) {
    return { ok: false, message: "The registration system has no email for this family. Message the office." };
  }

  const booked = picks.map((p) => ({ activityId: p.session.activityId, name: p.session.name, date: p.day.label }));
  const summary = booked.map((b) => `${b.name} on ${b.date}`).join(", ");

  /* Mock mode: the fixture store plays the registration system. No network. */
  if (isMock()) {
    const { mockBookWithCredits } = await import("@/lib/api/registration/punch-card-mock");
    try {
      mockBookWithCredits(camper.id, picks.map((p) => p.session.activityId));
    } catch (error) {
      return { ok: false, message: friendlyHoldError(error instanceof Error ? error.message : String(error), picks) };
    }
    revalidatePath("/day-camps");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `${childName} is booked into ${summary}. ${card.credits.day - picks.length} credit${card.credits.day - picks.length === 1 ? "" : "s"} left.`,
      booked,
      creditsLeft: card.credits.day - picks.length,
    };
  }
  if (!isSupabaseConfigured()) return { ok: false, message: "Booking isn't available in this environment." };

  /* 3. The hold — as anon, as a parent on the website is judged. */
  const items = picks.map((p, i) => ({ activity_id: p.session.activityId, camper: camper.name, ci: i }));
  const { data: hold, error: holdError } = await getWebsiteAnonClient().rpc("acquire_hold_guest", {
    p_items: items,
    p_email: camper.email,
  });
  if (holdError) {
    return { ok: false, message: friendlyHoldError(holdError.message, picks) };
  }
  const holdId = (hold as { hold_id?: string } | null)?.hold_id;
  if (!holdId || !/^[0-9a-f-]{36}$/.test(holdId)) {
    return { ok: false, message: "The registration system didn't give us a hold. Nothing was booked — please try again." };
  }

  /* 4. The checkout's own endpoint, the $0 path. */
  let confirmed = false;
  let payError: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), registration.regPayTimeoutMs);
    try {
      const res = await fetch(registration.regPayUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hold_id: holdId,
          plan: "full",
          email: camper.email,
          parent_name: camper.parentName ?? undefined,
          confirm_free: true,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await res.json().catch(() => null)) as { confirmed?: boolean; free?: boolean; client_secret?: string; error?: string } | null;
      confirmed = res.ok && payload?.confirmed === true;
      if (!confirmed) {
        payError = payload?.client_secret
          ? "That cart wasn't fully covered by credits"
          : payload?.error ?? `HTTP ${res.status}`;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    payError = error instanceof Error ? error.message : String(error);
  }

  // Anything other than {confirmed:true} is a failure — but check whether the
  // order was written anyway before telling the parent it wasn't (a timeout
  // after reg-pay committed is the case that matters).
  if (!confirmed) {
    const { data: order } = await getWebsiteReadClient()
      .from("orders")
      .select("id")
      .eq("stripe_payment_intent", `free_${holdId}`)
      .maybeSingle();
    if (!order) {
      console.error("punch card: reg-pay did not confirm", { holdId, payError });
      return { ok: false, message: "The registration system didn't confirm the booking. Nothing was charged and no credit was used — please try again, or message the office." };
    }
    confirmed = true;
  }

  /* 5. Did the credit move? Never a second writer — report, don't repair. */
  let creditNote = "";
  try {
    const web = getWebsiteReadClient();
    const [{ data: event }, { data: camperRow }] = await Promise.all([
      web.from("credit_events").select("detail").eq("payment_intent", `free_${holdId}`).maybeSingle(),
      web.from("campers").select("day_camp_credits").eq("id", camper.id).maybeSingle(),
    ]);
    const redemptions = ((event as { detail?: { redemptions?: { camper?: string }[] } } | null)?.detail?.redemptions ?? []);
    const named = redemptions.some((r) => (r.camper ?? "").trim().toLowerCase() === camper.name.trim().toLowerCase());
    const balance = (camperRow as { day_camp_credits?: number } | null)?.day_camp_credits;
    if (!named || balance == null || balance !== card.credits.day - picks.length) {
      console.warn("punch card: credit not deducted as expected; will be reconciled", {
        holdId, named, balance, expected: card.credits.day - picks.length,
      });
      creditNote = " The credit will show as used once the registration system catches up.";
    }
  } catch {
    /* the booking stands; the note is best-effort */
  }

  /* 6. The hub enrollment, now rather than in fifteen minutes. */
  await reconcileFamilyNow(camper.id).catch((error) => {
    console.error("punch card: family reconcile failed (the scheduled sync is the backstop)", error);
  });

  /* 7. Tell the family's guardians, in-app: their own action, confirmed. */
  const creditsLeft = card.credits.day - picks.length;
  try {
    const hub = getServiceClient();
    const { data: parents } = await hub.from("profiles").select("id").eq("family_id", user.familyId).eq("role", "parent");
    if (parents?.length) {
      await hub.from("notifications").insert(
        parents.map((p) => ({
          user_id: p.id,
          type: "announcement",
          title: `${childName} is booked`,
          body: `${childName} is booked into ${summary}. ${creditsLeft} credit${creditsLeft === 1 ? "" : "s"} left.`,
          url: "/day-camps",
        }))
      );
    }
  } catch {
    /* the booking stands */
  }

  await logActivity({
    user,
    action: "daycamp.credit_booked",
    summary: `Booked ${childName} into ${summary} with ${picks.length} credit${picks.length === 1 ? "" : "s"}`,
    studentId: card.student.id,
    detail: { holdId, activityIds: picks.map((p) => p.session.activityId), camperId: camper.id },
  });

  /* 8. */
  revalidatePath("/day-camps");
  revalidatePath("/dashboard");
  return {
    ok: true,
    message: `${childName} is booked into ${summary}. ${creditsLeft} credit${creditsLeft === 1 ? "" : "s"} left.${creditNote}`,
    booked,
    creditsLeft,
  };
}

/** The checkout's own error strings, said the way a parent would want to hear them. */
function friendlyHoldError(message: string, picks: { day: PunchCardDay; session: PunchCardSession }[]): string {
  const soldOut = /SOLD_OUT_ACTIVITY:(\d+)/.exec(message);
  if (soldOut) {
    const pick = picks.find((p) => p.session.activityId === Number(soldOut[1]));
    return pick
      ? `${pick.session.name} on ${pick.day.label} just filled up. Nothing was booked — pick another day.`
      : "One of those days just filled up. Nothing was booked — pick another day.";
  }
  if (/GATED/.test(message)) return "Registration for that isn't open yet.";
  if (/unknown activity/.test(message)) return "One of those days is no longer on the calendar.";
  if (/not enough credits/.test(message)) return "Not enough credits for that many days.";
  return "The registration system couldn't hold those days. Nothing was booked — please try again.";
}

/**
 * The scheduled sync, for one family, right now: the website snapshot
 * narrowed to the camper's registration family, run through the same
 * reconcile the 15-minute job uses, under the job's own actor. The job then
 * finds the row by (student, target) and leaves it alone.
 */
async function reconcileFamilyNow(camperId: string): Promise<void> {
  const { data: camperRow } = await getWebsiteReadClient()
    .from("campers")
    .select("family_id")
    .eq("id", camperId)
    .maybeSingle();
  const familyExternalId = (camperRow as { family_id?: string } | null)?.family_id;
  if (!familyExternalId) return;
  const actorId = await jobActorId();
  if (!actorId) return;
  const snapshot = await getRegistrationProvider().fetchSnapshot({ familyExternalId });
  await getProvider().syncRegistration(actorId, snapshot, "manual");
}

/* ── paying: hand off to the website ──────────────────────────────────── */

const checkoutSchema = z.object({
  studentId: z.string().min(1),
  activityIds: z.array(z.number().int().positive()).max(12),
  packId: z.number().int().positive().optional(),
});

export interface CheckoutResult {
  ok: boolean;
  message?: string;
  /** Where to send the browser. */
  url?: string;
}

/**
 * Validate the cart, then send the family to the website's checkout with the
 * days and the child already chosen. No hold is taken here: a 30-minute hold
 * a parent may abandon in another tab is a worse experience than none, and
 * the checkout takes its own the moment they arrive.
 */
export async function checkoutDayCampsAction(
  input: { studentId: string; activityIds: number[]; packId?: number }
): Promise<CheckoutResult> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, message: "Sign in first." };
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Pick something to buy." };
  const { studentId, activityIds, packId } = parsed.data;
  if (!activityIds.length && packId == null) return { ok: false, message: "Pick a day or a pack first." };
  if (packId != null && !isDayCampPack(packId)) return { ok: false, message: "That isn't a pack we sell." };

  const board = await fetchPunchCards(user.familyId);
  const found = cardFor(board, studentId);
  if ("error" in found) return { ok: false, message: found.error };
  const { card } = found;
  const camper = card.camper!;
  if (!camper.email) {
    return { ok: false, message: "The registration system has no email for this family. Message the office." };
  }

  const chosen = activityIds.length ? pickSessions(card, activityIds) : { picks: [] };
  if ("error" in chosen) return { ok: false, message: chosen.error };
  if (packId != null) {
    const pack = board.packs.find((p) => p.activityId === packId);
    if (pack && !pack.bookable) return { ok: false, message: `${pack.name} isn't on sale right now.` };
  }

  const ids = [...chosen.picks.map((p) => p.session.activityId), ...(packId != null ? [packId] : [])];
  const url = registration.checkoutUrl({ activityIds: ids, email: camper.email, kid: camper.name });

  const childName = card.student.preferredName ?? card.student.firstName;
  await logActivity({
    user,
    action: "daycamp.checkout_handoff",
    summary: packId != null && !chosen.picks.length
      ? `Went to buy ${DAY_CAMP_PACKS[packId].name} for ${childName}`
      : `Went to pay for ${chosen.picks.length} day camp${chosen.picks.length === 1 ? "" : "s"} for ${childName}${packId != null ? ` and a ${DAY_CAMP_PACKS[packId].name}` : ""}`,
    studentId: card.student.id,
    detail: { activityIds: ids, camperId: camper.id },
  });
  return { ok: true, url };
}
