"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";
import { getPerformance } from "@/lib/performance";
import { sendSubmissionEmails } from "@/lib/performance/emails";
import type { ActPatch, FileKind, PerformerPatch, RehearsalAnswer } from "@/lib/performance/types";

/**
 * Performance Events, the family's buttons (hub 0097).
 *
 * The wizard calls these with typed arguments step by step; every one
 * re-reads the session and lets PerformanceService decide whether this
 * family may touch this act. Each returns a sentence for the parent rather
 * than throwing, so a refusal shows on the step instead of an error page.
 */

export type PerformanceActionResult = { ok: boolean; message?: string; actId?: string; status?: string };

async function family() {
  const user = await getSessionUser();
  if (!user?.familyId) throw new Error("Sign in as a parent to sign up to perform.");
  return user;
}

function fail(error: unknown): PerformanceActionResult {
  return { ok: false, message: error instanceof Error ? error.message : String(error) };
}

function touch(eventId?: string, actId?: string) {
  revalidatePath("/family/events");
  revalidatePath("/dashboard");
  if (eventId) revalidatePath(`/family/events/${eventId}`);
  if (eventId && actId) revalidatePath(`/family/events/${eventId}/act/${actId}`);
}

export async function startActAction(eventId: string, studentId: string, overrides: PerformerPatch = {}): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    const actId = await getPerformance().startAct(user, eventId, studentId, overrides);
    await logActivity({ user, action: "performance.act_started", summary: "Started a performance sign-up", detail: { eventId, actId } });
    touch(eventId, actId);
    return { ok: true, actId };
  } catch (e) {
    return fail(e);
  }
}

export async function saveActAction(actId: string, patch: ActPatch): Promise<PerformanceActionResult> {
  try {
    await getPerformance().saveAct(await family(), actId, patch);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addOwnPerformerAction(actId: string, studentId: string): Promise<PerformanceActionResult> {
  try {
    await getPerformance().addOwnPerformer(await family(), actId, studentId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function inviteFamilyAction(actId: string, email: string): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    await getPerformance().inviteFamily(user, actId, email);
    await logActivity({ user, action: "performance.invited", summary: "Invited another family to perform in an act", detail: { actId } });
    // The same answer whether or not anyone holds that address.
    return { ok: true, message: "Invitation sent. They confirm it in their own Parent Portal." };
  } catch (e) {
    return fail(e);
  }
}

export async function addGuestAction(
  actId: string,
  guest: { name: string; age?: number; guardianName?: string; guardianContact?: string }
): Promise<PerformanceActionResult> {
  try {
    await getPerformance().addGuest(await family(), actId, guest);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function removePerformerAction(actId: string, performerId: string): Promise<PerformanceActionResult> {
  try {
    await getPerformance().removePerformer(await family(), actId, performerId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePerformerAction(actId: string, performerId: string, patch: PerformerPatch): Promise<PerformanceActionResult> {
  try {
    await getPerformance().updatePerformer(await family(), actId, performerId, patch);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setRehearsalsAction(actId: string, answers: RehearsalAnswer[]): Promise<PerformanceActionResult> {
  try {
    await getPerformance().setRehearsals(await family(), actId, answers);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function acceptTermsAction(actId: string, accepted: boolean): Promise<PerformanceActionResult> {
  try {
    await getPerformance().acceptTerms(await family(), actId, accepted);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

/** A resized headshot (or any file in mock mode) arriving as a data URL. */
export async function attachDataUrlAction(
  actId: string,
  kind: FileKind,
  dataUrl: string,
  fileName: string,
  performerId?: string
): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    const type = /^data:([^;]+);base64,/.exec(dataUrl)?.[1] ?? "";
    const allowed: Record<FileKind, string[]> = {
      headshot: ["image/jpeg", "image/png", "image/webp"],
      track: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/wave"],
      sheet_music: ["application/pdf"],
    };
    if (!allowed[kind].includes(type)) throw new Error("That file type is not one we take here.");
    // About 4 MB of file; anything bigger goes straight to storage instead.
    if (dataUrl.length > 5_600_000) throw new Error("That file is too large to send this way.");
    const ext = EXTENSIONS[type] ?? (type === "application/pdf" ? ".pdf" : type.includes("wav") ? ".wav" : type === "audio/mpeg" ? ".mp3" : ".m4a");
    await getPerformance().attachFile(user, actId, kind, { dataUrl, extension: ext }, fileName, performerId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** A big file the browser already wrote to a path this server issued. */
export async function attachStoredAction(actId: string, kind: FileKind, path: string, fileName: string, performerId?: string): Promise<PerformanceActionResult> {
  try {
    await getPerformance().attachFile(await family(), actId, kind, { path }, fileName, performerId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearFileAction(actId: string, kind: FileKind, performerId?: string): Promise<PerformanceActionResult> {
  try {
    await getPerformance().clearFile(await family(), actId, kind, performerId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function copyStudentHeadshotAction(actId: string, performerId: string): Promise<PerformanceActionResult> {
  try {
    const copied = await getPerformance().useStudentHeadshot(await family(), actId, performerId);
    return copied ? { ok: true } : { ok: false, message: "We could not copy that photo. Upload one instead." };
  } catch (e) {
    return fail(e);
  }
}

export async function submitActAction(actId: string): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    const result = await getPerformance().submit(user, actId);
    if (!result.ok || !result.act || !result.event) return { ok: false, message: result.message };
    const fam = await getProvider().getFamily(user.id, user.familyId!);
    await sendSubmissionEmails({
      event: result.event,
      act: result.act,
      parentEmail: user.email,
      parentName: user.displayName,
      familyName: fam?.name ?? "A NOVAPA family",
      resubmitted: Boolean(result.resubmitted),
    });
    await logActivity({
      user,
      action: "performance.submitted",
      summary: `${result.resubmitted ? "Resubmitted" : "Submitted"} an act for ${result.event.title}`,
      detail: { actId, status: result.status },
    });
    touch(result.event.id, actId);
    return { ok: true, status: result.status };
  } catch (e) {
    return fail(e);
  }
}

export async function withdrawActAction(actId: string, eventId: string): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    const result = await getPerformance().withdraw(user, actId);
    if (!result.ok) return { ok: false, message: result.message };
    await logActivity({ user, action: "performance.withdrawn", summary: "Withdrew a performance act", detail: { actId } });
    touch(eventId, actId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function answerInviteAction(performerId: string, accept: boolean, eventId: string, studentId?: string): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    const result = await getPerformance().answerInvite(user, performerId, accept, studentId);
    if (!result.ok) return { ok: false, message: result.message };
    await logActivity({
      user,
      action: accept ? "performance.invite_accepted" : "performance.invite_declined",
      summary: accept ? "Confirmed a student for another family's act" : "Declined an invitation to perform",
      detail: { performerId },
    });
    touch(eventId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The participation fee: one line in the ordinary store cart, then the ordinary checkout. */
export async function addFeeToCartAction(actId: string): Promise<PerformanceActionResult> {
  try {
    const user = await family();
    const line = await getPerformance().feeCartLine(user, actId);
    if (!line) return { ok: false, message: "There is nothing to pay for this act." };
    await getProvider().addCatalogItemToCart(user.id, {
      productId: line.productId,
      quantity: 1,
      customization: { kind: "simple", note: line.note, performanceActId: line.actId },
    });
    revalidatePath("/store/cart");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
