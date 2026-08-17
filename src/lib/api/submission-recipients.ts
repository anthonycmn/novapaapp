import "server-only";
import { isOrgAddress, SUBMISSION_RECIPIENTS } from "@/config/submission-recipients";
import { getPortalReadClient } from "./supabase/client";

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
