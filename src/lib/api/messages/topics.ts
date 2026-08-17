import type { MessageRecipientRole, MessageTopic } from "./types";

/**
 * Turning a contact route into a message topic. Pure, so the rules below are
 * testable without a database.
 *
 * The one genuinely load-bearing decision here is the coverage role. A thread
 * is addressed to a person now, but it is still VISIBLE by role, and getting
 * that wrong is the failure this whole design has to avoid: a message saying
 * "my daughter's EpiPen expired" must not be readable only by one colleague
 * who is on a plane.
 *
 * So health_safety is chosen generously — by who owns the route, not by which
 * heading it happens to sit under. Katie owns "Drop-off, pick-up or transport",
 * which the contact tree files under Camp operations; it is still hers, and she
 * still needs to see it.
 */

const HEALTH_CATEGORY = "health & safety";

/** Titles that mean "this person is the health & safety cover". */
const HEALTH_TITLE = /health\s*&?\s*(and\s*)?safety/i;

export function coverageRoleFor(input: {
  category?: string;
  recipientTitle?: string;
}): MessageRecipientRole {
  const category = input.category?.trim().toLowerCase() ?? "";
  if (category === HEALTH_CATEGORY) return "health_safety";
  if (input.recipientTitle && HEALTH_TITLE.test(input.recipientTitle)) {
    return "health_safety";
  }
  return "admin";
}

/** The contact tree's three levels; anything unrecognised is the calm one. */
export function priorityOf(value: unknown): MessageTopic["priority"] {
  const text = String(value ?? "").trim().toLowerCase();
  if (text === "immediate") return "Immediate";
  if (text === "urgent") return "Urgent";
  return "Standard";
}

/**
 * A row of `staff_portal.v_family_contact_routes` as a topic.
 *
 * Returns null rather than a half-built topic when the row cannot address a
 * message — no owner, no email, no words on the button. An absent topic is a
 * topic nobody picks; a broken one is a parent pressing Send into nothing.
 */
export function topicFromRow(row: Record<string, unknown>): MessageTopic | null {
  const routeId = str(row.route_id);
  const topic = str(row.topic);
  const staffId = str(row.staff_id);
  const recipientEmail = str(row.recipient_email)?.toLowerCase();
  const recipientName = str(row.recipient_name);
  if (!routeId || !topic || !staffId || !recipientEmail || !recipientName) {
    return null;
  }

  const category = str(row.category) ?? "";
  const recipientTitle = str(row.recipient_title);

  return {
    routeId,
    category,
    topic,
    blurb: str(row.blurb),
    priority: priorityOf(row.priority),
    sortOrder: Number(row.sort_order ?? 100) || 100,
    staffId,
    recipientName,
    recipientTitle,
    recipientEmail,
    recipientRole: coverageRoleFor({ category, recipientTitle }),
  };
}

/**
 * "Katie Rivers, Director of Health & Safety" — the form Tony asked for.
 * Falls back to the bare name for anyone without a title on their record.
 */
export function describeRecipient(input: {
  recipientName?: string;
  recipientTitle?: string;
}): string {
  const name = input.recipientName?.trim();
  if (!name) return "";
  const title = input.recipientTitle?.trim();
  return title ? `${name}, ${title}` : name;
}

/**
 * Topics in the order a parent reads them: by category, then by the order the
 * contact tree gives, then alphabetically so the list never shuffles between
 * page loads on rows that tie.
 */
export function groupTopics(
  topics: MessageTopic[]
): Array<{ category: string; topics: MessageTopic[] }> {
  const byCategory = new Map<string, MessageTopic[]>();
  for (const topic of topics) {
    const list = byCategory.get(topic.category) ?? [];
    list.push(topic);
    byCategory.set(topic.category, list);
  }
  return [...byCategory.entries()]
    .map(([category, list]) => ({
      category,
      topics: [...list].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.topic.localeCompare(b.topic)
      ),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}
