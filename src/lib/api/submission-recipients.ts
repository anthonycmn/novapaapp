import "server-only";
import { isOrgAddress, SUBMISSION_RECIPIENTS } from "@/config/submission-recipients";
import { getPortalReadClient, getServiceClient } from "./supabase/client";

export interface ResolvedRecipient {
  name: string;
  email: string;
  jobTitle?: string;
}

/**
 * The submission list, with names and titles read across the bridge from
 * staff_portal.staff (Tony, 17 Aug 2026: "can be pulled from the bridge to the
 * staff portal").
 *
 * The bridge supplies identity; the config supplies the mailbox. It is
 * deliberately one-directional: if the portal row carries a personal address —
 * Katie Hamburger's is a gmail — we still send to the org mailbox, because a
 * family's child photo is not going to someone's personal inbox.
 *
 * Read failures are not fatal. A staff portal outage must not stop a parent's
 * design reaching the front office, so this degrades to the configured names.
 */
export async function resolveSubmissionRecipients(): Promise<ResolvedRecipient[]> {
  const configured = SUBMISSION_RECIPIENTS.filter((recipient) => {
    if (isOrgAddress(recipient.email)) return true;
    console.error(
      `submission recipient ${recipient.email} is not an @novapa.org address; dropped`
    );
    return false;
  });

  let byName = new Map<string, { fullName: string; jobTitle?: string }>();
  try {
    const portal = getPortalReadClient();
    const { data, error } = await portal
      .from("staff")
      .select("full_name, preferred_name, email, job_title, is_active")
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    byName = new Map(
      (data ?? []).map((row) => [
        String(row.full_name),
        { fullName: String(row.full_name), jobTitle: row.job_title ? String(row.job_title) : undefined },
      ])
    );
  } catch (error) {
    console.error(
      "staff portal bridge unavailable for recipient names:",
      error instanceof Error ? error.message : error
    );
  }

  return configured.map((recipient) => {
    const fromPortal = byName.get(recipient.portalName);
    return {
      name: fromPortal?.fullName ?? recipient.name,
      email: recipient.email,
      jobTitle: fromPortal?.jobTitle,
    };
  });
}

/**
 * Everybody who administers the portal — role, not a name list.
 *
 * Tony, 18 Aug 2026: "Make sure that pickup and drop off notifications go to
 * admin and super admin." A hand-kept list of five names cannot answer that
 * question: it was right the day it was written and goes wrong the day someone
 * is promoted. So this asks the profiles table who currently holds the role.
 *
 * Org mailboxes only, the same rule the configured list follows. A pickup
 * notice names a child, their household and when they will be alone at a kerb;
 * that does not go to somebody's personal inbox because their account happens
 * to carry the role. Anyone dropped for that reason is named in the log.
 *
 * A read failure returns nothing rather than throwing: the caller merges this
 * with the configured recipients, so a database wobble degrades to the old
 * five-name behavior instead of losing the notification.
 */
export async function resolveAdminRecipients(): Promise<ResolvedRecipient[]> {
  try {
    const db = getServiceClient();
    const { data, error } = await db
      .from("profiles")
      .select("display_name, email, role")
      .in("role", ["admin", "super_admin"]);
    if (error) throw new Error(error.message);

    const byEmail = new Map<string, ResolvedRecipient>();
    for (const row of data ?? []) {
      const email = String(row.email ?? "").trim();
      if (!email) continue;
      if (!isOrgAddress(email)) {
        console.error(
          `portal ${row.role} ${email} is not an @novapa.org address; not notified`
        );
        continue;
      }
      const key = email.toLowerCase();
      if (byEmail.has(key)) continue;
      const name = String(row.display_name ?? "").trim();
      byEmail.set(key, {
        // Several rows carry the mailbox as their display name. Showing
        // "katie@novapa.org (katie@novapa.org)" in a log helps nobody.
        name: name && name !== email ? name : email.split("@")[0],
        email,
        jobTitle: row.role === "super_admin" ? "Super Admin" : "Admin",
      });
    }
    return [...byEmail.values()];
  } catch (error) {
    console.error(
      "could not read portal admins:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}
