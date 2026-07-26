"use server";

import { revalidatePath } from "next/cache";
import { getProvider } from "@/lib/api";
import {
  getRegistrationProvider,
  RegistrationUnavailableError,
} from "@/lib/api/registration";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";

/**
 * Manual "resync now" (#8). Failures are recorded as a failed SyncRun so they
 * appear in the admin health view rather than disappearing into a log.
 */
export async function resyncRegistrationAction(): Promise<void> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) return;

  const provider = getProvider();
  const registration = getRegistrationProvider();

  try {
    const snapshot = await registration.fetchSnapshot();
    await provider.syncRegistration(user.id, snapshot, "manual");
  } catch (error) {
    const message =
      error instanceof RegistrationUnavailableError
        ? error.message
        : `Unexpected sync error: ${String(error)}`;
    await provider.recordSyncFailure(user.id, registration.source, "manual", message);
  }

  revalidatePath("/admin/registration");
  revalidatePath("/dashboard");
}
