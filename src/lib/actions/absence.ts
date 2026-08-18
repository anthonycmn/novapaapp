"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { notifySubmission, submissionMessage } from "./notify-submission";
import type { SubmissionState } from "./spirit-button";

/**
 * A family telling us a child will miss a rehearsal or a performance.
 *
 * Tony, 18 Aug 2026: "Allow for parents to submit absences in their dashboard
 * for their shows, and then the director and the show director each receive
 * that information."
 *
 * Two audiences, resolved two different ways and both deliberately:
 *
 *   THE DIRECTOR — whoever currently holds admin or super admin, read from the
 *   roles rather than a list of names, the same rule pickup notifications now
 *   follow.
 *
 *   THE SHOW DIRECTOR — the person the parent portal already routes a message
 *   about this show to. That resolution lives in listMessageTopicsForFamily
 *   and prefers the director, falls back to the rest of the creative team, and
 *   skips anyone without an org mailbox. Reusing it means an absence and a
 *   question about the same show cannot reach two different people.
 *
 * The report is stored first and mailed second, so a mail failure cannot lose
 * a parent telling us their child is ill.
 */

const absenceSchema = z
  .object({
    studentId: z.string().min(1, "Choose a student"),
    productionId: z.string().min(1, "Choose which show"),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first day"),
    endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the last day"),
    reason: z
      .string()
      .trim()
      .min(1, "Tell the director why, even briefly")
      .max(500),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: "The last day must be on or after the first",
    path: ["endsOn"],
  });

export async function reportAbsenceAction(
  _prev: SubmissionState,
  formData: FormData
): Promise<SubmissionState> {
  const user = await getSessionUser();
  if (!user?.familyId) return { ok: false, errors: { _form: "Not signed in" } };

  const parsed = absenceSchema.safeParse({
    studentId: formData.get("studentId"),
    productionId: formData.get("productionId"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  const provider = getProvider();

  /*
   * The child has to actually be in the show. Both ids come off the wire, and
   * an absence filed against somebody else's production would land in a
   * director's inbox about a child who was never coming.
   */
  const enrollments = await provider.getEnrollmentsForFamily(user.id, user.familyId);
  const enrolled = enrollments.some(
    (enrollment) =>
      enrollment.studentId === parsed.data.studentId &&
      enrollment.productionId === parsed.data.productionId &&
      enrollment.status !== "withdrawn"
  );
  if (!enrolled) {
    return {
      ok: false,
      errors: { productionId: "That student isn't registered for that show" },
    };
  }

  const [student, production] = await Promise.all([
    provider.getStudent(user.id, parsed.data.studentId),
    provider.getProduction(parsed.data.productionId),
  ]);
  const childName = student
    ? `${student.preferredName ?? student.firstName} ${student.lastName}`
    : "A student";
  const showTitle = production?.title ?? "their show";

  const report = await provider.createAbsenceReport(user.id, {
    studentId: parsed.data.studentId,
    productionId: parsed.data.productionId,
    offeringTitle: showTitle,
    startsOn: parsed.data.startsOn,
    endsOn: parsed.data.endsOn,
    reason: parsed.data.reason,
    reportedByName: user.displayName,
  });

  /* Who runs this show, by the same route a message about it would take. */
  const topics = await provider
    .listMessageTopicsForFamily(user.id, user.familyId)
    .catch(() => []);
  const showTopic = topics.find(
    (topic) => topic.routeId === `offering:/productions/${parsed.data.productionId}`
  );

  const dates =
    parsed.data.endsOn === parsed.data.startsOn
      ? formatDate(`${parsed.data.startsOn}T12:00:00Z`)
      : `${formatDate(`${parsed.data.startsOn}T12:00:00Z`)} – ${formatDate(
          `${parsed.data.endsOn}T12:00:00Z`
        )}`;

  const outcome = await notifySubmission({
    subject: `Absence — ${childName}, ${showTitle}`,
    category: "absence_report",
    includeAdmins: true,
    also: showTopic?.recipientEmail
      ? [
          {
            name: showTopic.recipientName,
            email: showTopic.recipientEmail,
            jobTitle: showTopic.recipientTitle,
          },
        ]
      : [],
    lines: [
      `${childName} will miss ${showTitle}.`,
      "",
      `When:   ${dates}`,
      `Reason: ${parsed.data.reason}`,
      "",
      `Reported by ${user.displayName}${user.family ? ` (${user.family.name})` : ""}`,
      `Reply to: ${user.email}`,
      "",
      showTopic?.recipientEmail
        ? `The show's ${showTopic.recipientTitle ?? "director"}, ${showTopic.recipientName}, was copied.`
        : "We could not identify a director with an org mailbox for this show, so only the office was told.",
    ],
  });

  await provider
    .recordAbsenceNotified(user.id, report.id, outcome.mailboxes)
    .catch(() => undefined);

  revalidatePath("/family/absences");
  revalidatePath("/admin/absences");
  return {
    ok: true,
    message: submissionMessage(
      outcome,
      "Thank you for telling us — the director knows to expect them back."
    ),
  };
}
