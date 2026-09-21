/**
 * What to call a parent.
 *
 * The Sep 21 2026 portal audit counted it: 176 of 815 rows in
 * `profiles` with role='parent' carry an email address in
 * `display_name`. The registration import wrote whatever the website account
 * had, and for a third of households that was the inbox, not a person. Every
 * surface that trusted `display_name` was one send away from opening with
 * "Hi aydenfelder6@gmail.com," and the sidebar was already showing it,
 * initials and all ("AY" on the avatar).
 *
 * One order, used everywhere a family reads their own name:
 *
 * 1. The guardian row. It is the name the office keeps and the only one the
 *    family can edit themselves (see `updateGuardian`), so it wins outright.
 * 2. `display_name`, when it is a name.
 * 3. Nothing.
 *
 * Step 3 is the point of the whole module. An address is not a name, and a
 * greeting with no name in it beats one addressed to an inbox. Callers get
 * an empty string and are expected to leave the slot empty rather than fill
 * it with something that is not the person.
 *
 * `peekLoginLink` reached the same conclusion on the welcome page first, in
 * its own three lines. This is that rule, shared.
 */

/**
 * An address standing in for a name.
 *
 * One `@` is the whole test, deliberately. This is not address validation:
 * the question is whether a family would recognise this string as their
 * name, and anything carrying an `@` fails that regardless of whether it
 * would also pass an RFC.
 */
export function looksLikeEmailAddress(value: string | null | undefined): boolean {
  return typeof value === "string" && value.includes("@");
}

export interface NameSources {
  /** `profiles.display_name`. An address for 176 of 815 parents. */
  displayName?: string | null;
  /** `guardians.full_name`, first and last, for the same person. */
  guardianName?: string | null;
}

/** The person's name, or "" when neither source holds one. */
export function realName({ displayName, guardianName }: NameSources): string {
  for (const candidate of [guardianName, displayName]) {
    const trimmed = candidate?.trim();
    if (trimmed && !looksLikeEmailAddress(trimmed)) return trimmed;
  }
  return "";
}

/**
 * The first name alone, for a greeting, or "" when there is no name to use.
 *
 * Never falls back to the local part of an address: "aydenfelder6" is no more
 * this parent's name than the whole address was.
 */
export function realFirstName(sources: NameSources): string {
  return realName(sources).split(/\s+/)[0] ?? "";
}
