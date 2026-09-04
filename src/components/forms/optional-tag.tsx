/**
 * "Optional", in gold — CJ, 4 Sep 2026: "Put the word Optional in Gold after
 * Dance Video and after Resume link", then "Make the Headshot at the top of the
 * audition page Optional with Gold as well."
 *
 * Gold rather than the muted grey every other hint uses, and deliberately:
 * these are the labels telling a family they may SKIP something, which is the
 * opposite of a warning and should not read like the fine print beside it. A
 * parent with no dance clip and no headshot should be able to see that from
 * across the page rather than reading each hint to find out.
 *
 * One component rather than the word typed at four sites, so they cannot drift
 * — and so that "what is optional here" is answerable by grep.
 */
export function OptionalTag() {
  return <span className="font-semibold uppercase tracking-wide text-gold">Optional</span>;
}
