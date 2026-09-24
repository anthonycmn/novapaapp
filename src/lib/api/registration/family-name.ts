/**
 * What a family is called when nobody told us.
 *
 * CJ, 24 Sep 2026: "rename the email-named families to their real names."
 * Provisioning named a family after the parent's surname, and when the
 * website held no parent name it fell back to the part of the email before
 * the @ — "cbay99 Family", printed on receipts and staff screens. Most of those
 * families do have a real name on file: a child's surname, a guardian typed
 * in later, a camper on the website. This is the one rule both provisioning
 * and the one-off rename use, so the two cannot disagree.
 *
 * The order, and why:
 *   1. The children's surname, when they share one. It is the name the office,
 *      the rosters and the programs already know the family by.
 *   2. Children with different surnames: the parent surname that matches one
 *      of them, else the first parent surname on file.
 *   3. No children on file: the first parent surname.
 *   4. Nothing: null. An email stays an email rather than a guess.
 */

const EMAILISH = /@|^\S+\.\S+$/;

function clean(name: string | null | undefined): string {
  return (name ?? "").replace(/\s+/g, " ").trim();
}

/** "jones" -> "Jones", "o'leary" -> "O'Leary"; anything already cased is left alone. */
export function tidySurname(name: string): string {
  if (name !== name.toLowerCase()) return name;
  return name.replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** A person's surname, or "" for a blank or an email address. */
export function surnameOf(fullName: string | null | undefined): string {
  const name = clean(fullName);
  if (!name || EMAILISH.test(name)) return "";
  const parts = name.split(" ");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function realFamilyName(input: {
  /** Parent names in order of trust: the website's, then guardians, then logins. */
  parentNames: (string | null | undefined)[];
  /** Students' last_name fields. */
  studentLastNames: (string | null | undefined)[];
  /** Full names of the family's campers on the website, for a family with no students yet. */
  camperNames?: (string | null | undefined)[];
}): string | null {
  const parents = input.parentNames.map(surnameOf).filter(Boolean);

  let children = input.studentLastNames.map(clean).filter((n) => n && !EMAILISH.test(n));
  if (!children.length) children = (input.camperNames ?? []).map(surnameOf).filter(Boolean);

  const distinct = [...new Map(children.map((n) => [n.toLowerCase(), n])).values()];
  // "Rose Dickens" and "Dickens" are one family: compare the final word too.
  const finals = new Set(distinct.map((n) => n.split(" ").pop()!.toLowerCase()));

  let chosen: string | undefined;
  if (distinct.length === 1) chosen = distinct[0];
  else if (distinct.length > 1 && finals.size === 1) {
    chosen = distinct.reduce((a, b) => (a.length <= b.length ? a : b));
  } else if (distinct.length > 1) {
    const lower = new Set([...distinct.map((n) => n.toLowerCase()), ...finals]);
    chosen = parents.find((p) => lower.has(p.toLowerCase())) ?? parents[0];
  } else chosen = parents[0];

  return chosen ? `${tidySurname(chosen)} Family` : null;
}

/** A family name that is really the front half of an email address. */
export function isEmailDerivedName(name: string, emails: string[]): boolean {
  const stem = name.replace(/ Family$/, "").trim().toLowerCase();
  return emails.some((e) => e.split("@")[0].trim().toLowerCase() === stem);
}
