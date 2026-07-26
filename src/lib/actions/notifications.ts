"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import type { NotificationType } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";

export async function markReadAction(notificationId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().markNotificationRead(user.id, notificationId);
  revalidatePath("/notifications");
}

export async function markAllReadAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().markAllNotificationsRead(user.id);
  revalidatePath("/notifications");
}

export async function toggleNotificationTypeAction(
  type: NotificationType,
  enabled: boolean
): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().updateNotificationPrefs(user.id, { enabled: { [type]: enabled } });
  revalidatePath("/notifications/settings");
}

export async function setQuietHoursAction(formData: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  const start = String(formData.get("quietHoursStart") ?? "") || undefined;
  const end = String(formData.get("quietHoursEnd") ?? "") || undefined;
  await getProvider().updateNotificationPrefs(user.id, {
    quietHoursStart: start,
    quietHoursEnd: end,
  });
  revalidatePath("/notifications/settings");
}
