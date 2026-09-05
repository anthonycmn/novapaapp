"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { ARRIVAL_RECIPIENTS } from "@/config/submission-recipients";
import { logActivity } from "@/lib/activity";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { refuseIfImpersonating } from "@/lib/auth/impersonation";
import { formatDate } from "@/lib/format";
import { notifySubmission, submissionMessage } from "./notify-submission";
import type { FamilyFormState } from "./family";
import type { SubmissionState } from "./spirit-button";

const requestSchema = z
  .object({
    studentId: z.string().min(1, "Choose a student"),
    kind: z.enum(["late_dropoff", "early_pickup", "both"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date"),
    recurringDays: z.array(z.number().int().min(0).max(6)),
    dropOffTime: z.string().optional(),
    pickUpTime: z.string().optional(),
    reason: z.string().min(1, "Tell us why so we can plan staffing").max(500),
    supervisingAdult: z.string().max(120).optional(),
    authorizedPickupPerson: z.string().max(120).optional(),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  })
  .refine(
    (data) => data.kind === "early_pickup" || !!data.dropOffTime,
    { message: "Enter the drop-off time", path: ["dropOffTime"] }
  )
  .refine(
    (data) => data.kind === "late_dropoff" || !!data.pickUpTime,
    { message: "Enter the pick-up time", path: ["pickUpTime"] }
  );

export async function createPickupRequestAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<SubmissionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  /* Hub 0063. Who may collect a child is the parent's to say, and a change
     here has to be traceable to the parent who asked for it rather than to
     whoever happened to take the call. */
  const refused = await refuseIfImpersonating("pickup");
  if (refused) return { ok: false, errors: { _form: refused.message } };

  const parsed = requestSchema.safeParse({
    studentId: formData.get("studentId"),
    kind: formData.get("kind"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    recurringDays: formData.getAll("recurringDays").map((value) => Number(value)),
    dropOffTime: String(formData.get("dropOffTime") ?? "") || undefined,
    pickUpTime: String(formData.get("pickUpTime") ?? "") || undefined,
    reason: formData.get("reason"),
    supervisingAdult: String(formData.get("supervisingAdult") ?? "") || undefined,
    authorizedPickupPerson: String(formData.get("authorizedPickupPerson") ?? "") || undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const provider = getProvider();
  await provider.createPickupRequest(user.id, parsed.data);
  const student = await provider.getStudent(user.id, parsed.data.studentId);
  const childName = student
    ? `${student.preferredName ?? student.firstName} ${student.lastName}`
    : "a student";

  await logActivity({
    user,
    action: "pickup.requested",
    summary: `Requested ${KIND_LABEL[parsed.data.kind].toLowerCase()} for ${childName} (${
      parsed.data.startDate
    }${parsed.data.endDate !== parsed.data.startDate ? ` – ${parsed.data.endDate}` : ""})`,
    studentId: parsed.data.studentId,
    detail: {
      reason: parsed.data.reason,
      dropOffTime: parsed.data.dropOffTime,
      pickUpTime: parsed.data.pickUpTime,
      authorizedPickupPerson: parsed.data.authorizedPickupPerson,
    },
  });

  /**
   * Tell the office. Tony, 17 Aug 2026: "A notification is then sent to Katie
   * Rivers, KDH, Tony, Todd, and Jen" — the whole submission list — and on
   * 18 Aug: "Make sure that pickup and drop off notifications go to admin and
   * super admin", so whoever holds those roles today is added to it.
   *
   * After the request is stored, so a mail failure cannot lose it.
   */
  const outcome = await notifySubmission({
    subject: `${KIND_LABEL[parsed.data.kind]} — ${childName}`,
    category: "pickup_request",
    includeAdmins: true,
    lines: [
      `${childName}: ${KIND_LABEL[parsed.data.kind].toLowerCase()} requested.`,
      "",
      `Dates:  ${formatDate(`${parsed.data.startDate}T12:00:00Z`)}${
        parsed.data.endDate !== parsed.data.startDate
          ? ` – ${formatDate(`${parsed.data.endDate}T12:00:00Z`)}`
          : ""
      }`,
      parsed.data.dropOffTime ? `Arriving:  ${parsed.data.dropOffTime}` : "",
      parsed.data.pickUpTime ? `Collected: ${parsed.data.pickUpTime}` : "",
      `Reason: ${parsed.data.reason}`,
      parsed.data.authorizedPickupPerson
        ? `Collected by: ${parsed.data.authorizedPickupPerson}`
        : "",
      parsed.data.supervisingAdult
        ? `Supervising adult: ${parsed.data.supervisingAdult}`
        : "",
      "",
      `Requested by ${user.displayName}${user.family ? ` (${user.family.name})` : ""}`,
      `Reply to: ${user.email}`,
      "",
      "It is pending until somebody approves it in the portal.",
    ],
  });

  revalidatePath("/family/pickup");
  revalidatePath("/admin/pickup");
  return {
    ok: true,
    message: submissionMessage(
      outcome,
      "You'll see it here as soon as it's approved, and you can tap “I'm here” on the day.",
    ),
  };
}

const KIND_LABEL: Record<"late_dropoff" | "early_pickup" | "both", string> = {
  early_pickup: "Early pickup",
  late_dropoff: "Late drop-off",
  both: "Late drop-off and early pickup",
};

/**
 * "I'm here" — a parent at the kerb.
 *
 * Goes to Katie Rivers and Katie Hamburger (Tony, 17 Aug 2026) — two people who
 * can walk to a door, rather than the five who get the paperwork — plus admins
 * and super admins (Tony, 18 Aug 2026). The named pair is still who OWNS the
 * door; the roles are copied because a parent standing at the kerb is the
 * organization's responsibility, not one front-desk shift's.
 *
 * A repeat press is a no-op that reports the original time rather than sending
 * again, because pressing twice is exactly what a parent does when nothing
 * appears to happen.
 */
export async function markArrivedAction(requestId: string): Promise<SubmissionState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  const provider = getProvider();
  let result;
  try {
    result = await provider.markPickupArrived(user.id, requestId, user.displayName);
  } catch (error) {
    return {
      ok: false,
      errors: { _form: error instanceof Error ? error.message : String(error) },
    };
  }

  if (result.alreadyArrived) {
    revalidatePath("/family/pickup");
    return { ok: true, message: "Already told them — they know you're here." };
  }

  const student = await provider.getStudent(user.id, result.request.studentId);
  const childName = student
    ? `${student.preferredName ?? student.firstName} ${student.lastName}`
    : "a student";

  await logActivity({
    user,
    action: "pickup.arrived",
    summary: `Tapped “I'm here” for ${childName}`,
    studentId: result.request.studentId,
  });

  const outcome = await notifySubmission({
    subject: `HERE NOW — ${user.displayName} for ${childName}`,
    category: "pickup_arrival",
    only: ARRIVAL_RECIPIENTS.map((recipient) => recipient.email),
    includeAdmins: true,
    lines: [
      `${user.displayName} is here now for ${childName}.`,
      "",
      `${KIND_LABEL[result.request.kind]}${
        result.request.pickUpTime ? ` · due ${result.request.pickUpTime}` : ""
      }`,
      result.request.authorizedPickupPerson
        ? `Authorized to collect: ${result.request.authorizedPickupPerson}`
        : "",
      user.family ? `Household: ${user.family.name}` : "",
    ],
  });

  revalidatePath("/family/pickup");
  revalidatePath("/admin/pickup");
  return {
    ok: true,
    message:
      outcome.delivered > 0
        ? "They know you're here. Someone is on their way."
        : "Saved — but we could not reach anyone by email. Please call the front desk.",
  };
}

export async function decidePickupRequestAction(
  requestId: string,
  status: "approved" | "denied",
  formData: FormData
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  const note = String(formData.get("note") ?? "").trim() || undefined;
  await getProvider().decidePickupRequest(user.id, requestId, { status, note });
  revalidatePath("/admin/pickup");
  revalidatePath("/family/pickup");
  revalidatePath("/schedule");
}
