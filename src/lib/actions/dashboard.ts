"use server";

import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { parseLayout, type DashboardLayout } from "@/lib/dashboard-layout";

/**
 * Save how somebody arranged their own dashboard (0060).
 *
 * The layout is parsed here as well as in the provider. This action is
 * reachable by anybody signed in, and what arrives is whatever the browser
 * sent — so it is treated as untrusted shape, not as a DashboardLayout,
 * until it has been through parseLayout.
 *
 * Nothing here is an access decision: a layout only ever names panels, and
 * every panel's content is fetched by the dashboard for the signed-in account.
 */
export async function saveDashboardLayoutAction(layout: DashboardLayout): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  await getProvider().saveDashboardLayout(user.id, parseLayout(layout));
  /*
   * Deliberately NOT revalidatePath("/dashboard"). The arranger has already
   * moved the panel on screen and every panel's content is unchanged, so
   * re-rendering the whole dashboard — a dozen queries — on each click of an
   * arrow would buy a flicker and nothing else. The next real visit reads the
   * saved layout.
   */
}
