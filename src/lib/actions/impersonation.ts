"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, sessionCookieName } from "@/lib/auth/session";
import { getEmailDeliveryProvider } from "@/lib/api/email";
import { getServiceClient } from "@/lib/api/supabase/client";
import {
  BLOCKED_ACTIONS,
  currentImpersonation,
  impersonationCookieName,
  type BlockedAction,
} from "@/lib/auth/impersonation";

/**
 * "I could not do that for you — here is a link so you can."
 *
 * CJ chose this over a bare refusal, and it is the right half of the feature:
 * the four blocked things all come up mid-support-call, and the useful move is
 * not "no" but "check your email, it will take you ten seconds". The Chief is
 * usually still on the phone while it lands.
 *
 * Sent to the address on the account and nowhere else. Not to an address typed
 * into a box: a mail that says "someone at NoVAPA was in your account, please
 * sign this" is exactly the mail worth forging, and the only way it cannot be
 * pointed somewhere new is if the destination is never an input.
 */

const WHERE: Record<BlockedAction, { path: string; label: string }> = {
  document: { path: "/family/documents", label: "your family documents" },
  pickup: { path: "/family/pickup", label: "pickup and collection" },
  health: { path: "/family/students", label: "your child's health form" },
  store: { path: "/store", label: "your basket" },
};

export async function askTheParentAction(
  action: BlockedAction
): Promise<{ ok: boolean; message: string }> {
  const active = await currentImpersonation();
  const user = await getSessionUser();

  if (!user) return { ok: false, message: "Not signed in." };
  if (!active) {
    // A real parent pressing this would be being told to email themselves.
    return { ok: false, message: "You are signed in as yourself — just do it here." };
  }
  if (!user.email) {
    return { ok: false, message: "There is no email address on this account to send to." };
  }

  const where = WHERE[action];
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://portal.novapa.org";

  try {
    await getEmailDeliveryProvider().send({
      to: user.email,
      category: "impersonation-handoff",
      // So a reply reaches the person who was actually on the phone.
      replyTo: active.actorEmail,
      subject: `One thing we need you to do — ${where.label}`,
      text: [
        `Hello,`,
        ``,
        `${active.actorName ?? active.actorEmail} at NoVAPA was helping with your account`,
        `and got as far as they can. ${capitalise(BLOCKED_ACTIONS[action])} has to be done`,
        `by you — we do not do that part on a family's behalf.`,
        ``,
        `Open ${site}${where.path} and it will take a moment.`,
        ``,
        `If you were not expecting this, reply to this email and it reaches`,
        `${active.actorEmail} directly.`,
        ``,
        `— NoVAPA`,
      ].join("\n"),
    });
  } catch (e) {
    return {
      ok: false,
      message: `That did not send: ${e instanceof Error ? e.message : "unknown error"}`,
    };
  }

  // Recorded on the session, so the next person to look can see both that it
  // was refused and that the family was asked.
  try {
    await getServiceClient().rpc("append_impersonation_block", {
      p_session: active.id,
      p_action: `${action}:asked-the-parent`,
    });
  } catch {
    /* The mail is the point. */
  }

  return { ok: true, message: `Sent to ${user.email}. They can do it from the link.` };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Leave the account.
 *
 * Both cookies go, not just the marker. Clearing the marker alone would leave
 * a Chief holding a working session inside a parent's account with nothing on
 * screen to say so — which is the precise state this whole feature exists to
 * make impossible.
 *
 * Closing the record is best-effort: failing to write "they left" must never
 * be the reason somebody is still inside. A row with no ended_at reads as
 * "ended when the window lapsed", which is true either way.
 */
export async function leaveImpersonationAction(): Promise<void> {
  const active = await currentImpersonation();

  if (active) {
    try {
      await getServiceClient()
        .from("impersonation_sessions")
        .update({ ended_at: new Date().toISOString(), ended_reason: "left" })
        .eq("id", active.id)
        .is("ended_at", null);
    } catch {
      /* See above. */
    }
  }

  const jar = await cookies();
  jar.delete(sessionCookieName);
  jar.delete(impersonationCookieName);
  redirect("/login?left=1");
}
