import { z } from "zod";
import type { EmergencyContact } from "@/lib/api/types";

/**
 * Turning four parallel form fields into a list of emergency contacts.
 *
 * Pure, and separate from the server action, so the rules that decide whether a
 * parent's save is accepted can be tested without a session: which rows are
 * dropped, which are refused, and which keep the id they already had.
 */

const rowSchema = z.object({
  fullName: z.string().trim().min(1, "Enter their name"),
  /**
   * Not a format check. This is the number somebody dials when a child is hurt,
   * and a household may legitimately give an extension, a work line or an
   * international number — refusing "01234 567 890" would be worse than storing
   * it as typed.
   */
  phone: z.string().trim().min(7, "Enter a phone number we can call"),
  relationship: z.string().trim().max(40),
});

export interface EmergencyContactRow {
  id: string;
  fullName: string;
  phone: string;
  relationship: string;
}

export interface ParsedEmergencyContacts {
  contacts: EmergencyContact[];
  /** Keyed `ec-<row index>-<field>`, matching the inputs the editor renders. */
  errors: Record<string, string>;
}

export function parseEmergencyContacts(
  rows: EmergencyContactRow[],
  newId: () => string
): ParsedEmergencyContacts {
  const contacts: EmergencyContact[] = [];
  const errors: Record<string, string> = {};

  rows.forEach((row, index) => {
    // An untouched blank row is somebody who clicked "add another" and changed
    // their mind. Dropping it silently is kinder than an error they have to
    // clear before they can save the rows they did fill in.
    if (!row.fullName.trim() && !row.phone.trim() && !row.relationship.trim()) return;

    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        errors[`ec-${index}-${String(issue.path[0] ?? "_form")}`] = issue.message;
      }
      return;
    }

    contacts.push({
      // A contact keeps its id across an edit, so anything that ever points at
      // one is not looking at a different person after a typo fix.
      id: row.id.trim() || newId(),
      ...parsed.data,
    });
  });

  return { contacts, errors };
}
