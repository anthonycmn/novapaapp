"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Answering a call: attending, not attending, injury, partial — or clearing it.
 *
 * Returns a plain verdict rather than a FamilyFormState because this is not a
 * form: it is a chip on a calendar card opening a dialog, called from a
 * transition, and the caller needs one boolean and one sentence to put its own
 * state back if the write failed.
 *
 * Anything but attending files an absence report, in the same transaction, in
 * the database function. That is deliberate and it is the whole point: the
 * absence is what the morning digest emails to directors and what the staff
 * Conflicts page reads, so a parent answering here has told the people who
 * needed telling, rather than filling in a second thing nobody watches.
 */

const schema = z.object({
  eventId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["attending", "not_attending", "injury", "partial", "clear"]),
  reason: z.string().trim().max(500).optional(),
});

export async function respondToCallAction(input: {
  eventId: string;
  studentId: string;
  status: "attending" | "not_attending" | "injury" | "partial" | "clear";
  reason?: string;
}): Promise<{ ok: boolean; message?: string }> {
  try {
    const user = await getSessionUser();
    if (!user?.familyId) return { ok: false, message: "Sign in first." };

    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Check that again." };
    }

    const result = await getProvider().respondToCall(user.id, parsed.data);
    if (!result.ok) return result;

    // Both places the answer is drawn.
    revalidatePath("/dashboard");
    revalidatePath("/schedule");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
