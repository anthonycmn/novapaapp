/**
 * An optional text column, read as what it means.
 *
 * A nullable text column has two ways to say "nothing here": NULL, and the
 * empty string a form posts when a parent clears the box. They mean the same
 * thing to a human and different things to `??`, which is how Azalea Wong's
 * name disappeared.
 *
 * Yin, her parent, 8 Sep 2026: "it doesn't properly display Azalea's name. I
 * suspect that you only need to fix how the name is retrieved. I double checked
 * and found that Azalea's full name is already entered properly in the
 * account." Her name was entered properly. Her PREFERRED name was an empty
 * string, and every `student.preferredName ?? student.firstName` in the app —
 * there are over a hundred — happily rendered the empty string, because `??`
 * only falls back past null and undefined. She was a colored dot with no name
 * beside it on her own family's calendar.
 *
 * Twenty-seven children were in that state on 10 Sep 2026. Fixing them one
 * call site at a time would have left the hundred-and-first to be found by
 * another parent, so blank is resolved to absent here, at the edge where a row
 * becomes an object, and the rest of the app can go on trusting `??`.
 */
export function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

/**
 * The same rule going the other way: what to store when a form clears a box.
 *
 * Clearing must still clear — an out-of-date allergy note a parent deleted has
 * to stay deleted — so this maps a cleared field to NULL rather than dropping
 * it. Undefined still means "the form did not post this field", and stays
 * undefined so the stored value is left alone.
 */
export function nullIfBlank<T>(value: T): T | null {
  if (typeof value !== "string") return value;
  return value.trim() === "" ? null : (value as T);
}
