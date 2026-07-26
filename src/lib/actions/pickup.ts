"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import type { FamilyFormState } from "./family";

const requestSchema = z
  .object({
    studentId: z.string().min(1, "Choose a student"),
    kind: z.enum(["early_dropoff", "late_pickup", "both"]),
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
    (data) => data.kind === "late_pickup" || !!data.dropOffTime,
    { message: "Enter the drop-off time", path: ["dropOffTime"] }
  )
  .refine(
    (data) => data.kind === "early_dropoff" || !!data.pickUpTime,
    { message: "Enter the pick-up time", path: ["pickUpTime"] }
  );

export async function createPickupRequestAction(
  _prev: FamilyFormState,
  formData: FormData
): Promise<FamilyFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, errors: { _form: "Not signed in" } };

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

  await getProvider().createPickupRequest(user.id, parsed.data);
  revalidatePath("/family/pickup");
  return { ok: true };
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
