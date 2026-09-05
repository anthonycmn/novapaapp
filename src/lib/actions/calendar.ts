"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Reset the family's calendar-feed token. The subscribe card has warned
 * "anyone with this link can see your schedule" since day one without
 * offering the lever a leaked link needs (Sep 5 2026 audit). Every device
 * subscribed to the old link stops receiving the moment this runs — which is
 * the point, and why the card says so before the click.
 */
export async function resetCalendarLinkAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user?.familyId) return;

  await getProvider().regenerateCalendarToken(user.id, user.familyId);

  await logActivity({
    user,
    action: "calendar.link_reset",
    summary: "Reset the family calendar link",
  });

  revalidatePath("/schedule");
}
