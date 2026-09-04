import "server-only";
import { getProvider } from "@/lib/api";
import type { HealthForm, SessionUser } from "@/lib/api/types";

/**
 * What the sidebar should be pointing at.
 *
 * CJ, 4 Sep 2026: "whenever there is a notification put a notification mark
 * next to the menu item that the notification is there - if forms are not
 * finished make sure to leave the notifications there until the forms are
 * filled out in the nav menu."
 *
 * TWO KINDS OF MARK, AND THE SECOND IS THE POINT. An unread notification is a
 * thing that happened; an unfinished form is a thing that has NOT happened, and
 * it does not announce itself. A parent who has never opened the document vault
 * has no idea a health form is waiting there, and a badge that clears itself
 * when the page is visited would let them look once, do nothing, and never be
 * asked again. So these are computed from the state of the record rather than
 * from whether anybody looked: the mark stays until the form is signed, which
 * is exactly what CJ asked for.
 *
 * Keyed by href so the sidebar and the mobile drawer read the same map and
 * cannot drift. Anything not in the map has no mark.
 */
export type NavAlerts = Record<string, number>;

/**
 * Is this child's health form still outstanding?
 *
 * The single rule, shared with the agreements panel that renders the detail —
 * see components/family/agreements-panel. Missing, unsigned and expired are
 * three different sentences to a parent and the same answer to a badge, and if
 * these two ever disagreed the nav would be telling a family to go and finish
 * something the page says is done.
 */
export function isHealthFormOutstanding(form: HealthForm | null): boolean {
  if (!form) return true;
  if (!form.signedAt || !form.signedByName?.trim()) return true;
  return Date.parse(`${form.expiresOn}T12:00:00Z`) < Date.now();
}

export async function getNavAlerts(user: SessionUser): Promise<NavAlerts> {
  const provider = getProvider();
  const alerts: NavAlerts = {};

  // Things that happened.
  const unread = await provider.getUnreadNotificationCount(user.id);
  if (unread > 0) alerts["/notifications"] = unread;

  // Things that have not. Only a family has forms to finish; staff reading
  // this app have nothing outstanding of their own.
  if (!user.familyId) return alerts;

  const season = await provider.getCurrentSeason();
  if (!season) return alerts;

  const students = await provider.getStudentsForFamily(user.id, user.familyId);
  const forms = await Promise.all(
    students.map((student) =>
      provider
        .getHealthForm(user.id, student.id, season.id)
        .catch(() => null as HealthForm | null)
    )
  );

  const outstanding = forms.filter(isHealthFormOutstanding).length;
  if (outstanding > 0) alerts["/family/documents"] = outstanding;

  return alerts;
}
