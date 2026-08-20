import { z } from "zod";

/**
 * The rules that decide whether a parent's edit to a child's profile is saved.
 *
 * Pure, and separate from the server action, so they can be tested without a
 * session — the same reason parseEmergencyContacts() lives apart from its
 * action. This file exists because these rules shipped untested on 17 Aug 2026
 * with a date-of-birth pattern that matched the literal text "dddd-dd-dd" and
 * so refused every real birthday, which silently blocked the whole form.
 */

export const T_SHIRT_SIZES = ["YXS", "YS", "YM", "YL", "AS", "AM", "AL", "AXL"] as const;

/** Exactly the fields the edit form posts, in the order it renders them. */
export const STUDENT_PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "preferredName",
  "pronouns",
  "grade",
  "school",
  "tshirtSize",
  "allergies",
  "medicalFlags",
  "vocalRange",
  "danceExperience",
  "auditionSongUrl",
] as const;

/**
 * A date the calendar actually has. The regex alone would take 2015-02-30, and
 * Date happily rolls that forward to 2 March, so the age every downstream
 * reader derives — FSA eligibility above all — would be computed from a day the
 * parent never typed. Round-tripping catches it.
 */
function isRealDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const studentProfileSchema = z.object({
  /*
   * Legal name and date of birth are editable now (Tony, 17 Aug 2026), and they
   * carry a consequence the other fields do not: the registration reconcile
   * matches Jason system participants to app students BY NAME. Rename a child
   * here and the next sync stops matching them, which breaks the enrollment and
   * balance link. The form says so; this is why it says so.
   */
  firstName: z.string().trim().min(1, "Legal first name is required").max(60),
  lastName: z.string().trim().min(1, "Legal last name is required").max(60),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date of birth")
    .refine(isRealDate, "That date isn't on the calendar"),
  preferredName: z.string().max(60).optional(),
  pronouns: z.string().max(30).optional(),
  grade: z.string().min(1, "Grade is required"),
  school: z.string().max(120).optional(),
  /*
   * "" is the "—" option, and it means "no size on file". It has to survive
   * the enum, or a size once chosen could never be taken back off.
   */
  tshirtSize: z.enum(T_SHIRT_SIZES).or(z.literal("")).optional(),
  allergies: z.string().max(500).optional(),
  medicalFlags: z.string().max(500).optional(),
  vocalRange: z.string().max(40).optional(),
  danceExperience: z.string().max(500).optional(),
  auditionSongUrl: z
    .string()
    .url("Enter a full URL (YouTube, Drive, or Dropbox)")
    .optional()
    .or(z.literal("")),
});

export type StudentProfileValues = z.infer<typeof studentProfileSchema>;

export type ParsedStudentProfile =
  | { ok: true; values: StudentProfileValues }
  | { ok: false; errors: Record<string, string> };

/**
 * Values come straight off the form: a string for a field that was on the page,
 * undefined for one that was not.
 *
 * The difference decides what a save means. An emptied box arrives as "" and
 * must CLEAR the stored value — a parent who deletes a stale allergy note has
 * to see it stay gone, and out-of-date medical text is worse than none. A field
 * the form never posted arrives as undefined and must leave the record alone.
 * Folding "" into undefined, as this once did, makes every clearing a no-op.
 */
export function parseStudentProfile(
  values: Record<string, string | undefined>
): ParsedStudentProfile {
  const parsed = studentProfileSchema.safeParse(values);
  if (parsed.success) return { ok: true, values: parsed.data };

  /*
   * First message per field wins. An empty date box trips both the pattern and
   * the calendar check, and "Enter a date of birth" is the one that tells a
   * parent what to do — "That date isn't on the calendar" is for a date they
   * actually typed.
   */
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "_form");
    if (!(field in errors)) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
