"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { sendBugReport } from "@/lib/bug-report/notify";
import type { BugEnvironment } from "@/lib/bug-report/environment";
import type { FamilyFormState } from "./family";

/**
 * The environment block, re-checked on the way in.
 *
 * It is collected in the browser, which means it arrives as whatever the
 * browser was persuaded to send. None of it is trusted for anything — it is
 * read by a person, never used to decide access — but a report is no use if
 * one absurd field makes the whole row unreadable, so each is capped.
 */
const environmentSchema = z.object({
  page: z.string().max(200),
  reportedAt: z.string().max(80),
  device: z.string().max(120),
  browser: z.string().max(80),
  screen: z.string().max(60),
  installed: z.boolean(),
  build: z.string().max(40),
  online: z.boolean(),
});

const reportSchema = z.object({
  /*
   * The only required field, and the bar is low on purpose. "the schedule is
   * wrong" is a report worth having; a form that demands steps to reproduce
   * collects them from developers and from nobody else.
   */
  whatHappened: z.string().trim().min(3, "Tell us what went wrong, in any words").max(4000),
  whatExpected: z.string().trim().max(4000).optional(),
  environment: environmentSchema,
});

export async function submitBugReportAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

  let environment: unknown = {};
  try {
    environment = JSON.parse(String(formData.get("environment") ?? "{}"));
  } catch {
    // A report with no environment is still a report. Say nothing, save it.
    environment = {};
  }

  const parsed = reportSchema.safeParse({
    whatHappened: String(formData.get("whatHappened") ?? ""),
    whatExpected: String(formData.get("whatExpected") ?? "") || undefined,
    environment,
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0] ?? "_form")] = issue.message;
    }
    return { ok: false, errors };
  }

  /*
   * Mail first, then the row.
   *
   * The other way round is the usual order and it is wrong here: the email IS
   * the feature — it is what reaches the person who fixes things — and the row
   * is the record that makes four reports of one bug visible. If the save
   * fails, CJ has already been told. If the mail fails, `emailed: false` is on
   * the row and the admin list says so out loud.
   */
  const emailed = await sendBugReport({
    reporterName: user.displayName,
    reporterEmail: user.email,
    whatHappened: parsed.data.whatHappened,
    whatExpected: parsed.data.whatExpected,
    environment: parsed.data.environment as BugEnvironment,
  });

  try {
    await getProvider().submitBugReport(user.id, {
      pagePath: parsed.data.environment.page,
      whatHappened: parsed.data.whatHappened,
      whatExpected: parsed.data.whatExpected,
      environment: parsed.data.environment as BugEnvironment,
      emailed,
    });
  } catch (error) {
    // The mail is out; do not tell a parent their report vanished.
    console.error("bug report save failed", error);
    if (!emailed) {
      return {
        ok: false,
        errors: {
          _form:
            "That didn't send, and the fault is ours rather than yours. Please email cj@novapa.org.",
        },
      };
    }
  }

  await logActivity({
    user,
    action: "bug.reported",
    summary: `Reported a bug on ${parsed.data.environment.page}`,
    detail: { page: parsed.data.environment.page, emailed },
  });
  revalidatePath("/admin/bugs");
  return { ok: true };
}

export async function setBugReportStatusAction(
  reportId: string,
  status: "new" | "handled"
): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;
  await getProvider().setBugReportStatus(user.id, reportId, status);
  revalidatePath("/admin/bugs");
}
