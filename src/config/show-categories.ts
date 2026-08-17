/**
 * What kind of offering a summer show code is, when the order line does not say.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `public.order_items` records a purchase in one of two mutually exclusive
 * ways: either an `activity_id` (which resolves to activities.category) or a
 * short `show` code plus an age band. As of 17 Aug 2026, 85 of 241 items have
 * the activity id and 156 have only the show code — and no item has both, so
 * the mapping cannot be learned from the data.
 *
 * Those 156 items are ~$96,000 of fees. Left unclassified they are excluded
 * from every Dependent Care FSA statement, because an unclassified fee is not
 * claimed. That is the safe default and the wrong answer: these are the summer
 * camps, and camp is exactly what a Dependent Care FSA reimburses.
 *
 * So the mapping is stated here rather than inferred by fuzzy name matching in
 * a parser. It is a claim a human can check in one query and correct in one
 * line, which is what a figure on somebody's tax paperwork deserves.
 *
 * HOW EACH ENTRY WAS VERIFIED
 * ---------------------------
 * Every show below was matched by hand against `public.activities`, where all
 * of its age bands — 5–9, 9–12, 12–15 and the 10–15 Technical Theatre track —
 * carry `category = 'camp'` unanimously. If a future show's bands disagree,
 * leave it out: null is excluded, and excluded is recoverable.
 *
 * TO ADD NEXT SEASON'S SHOWS
 * --------------------------
 *   select distinct show from public.order_items where activity_id is null;
 *   select name, category, age_range from public.activities where name ilike '%<show>%';
 * Add the code only if every row comes back with the same category.
 */
export const SHOW_CODE_CATEGORY: Record<string, string> = {
  // Broadway Bound | Charlie and the Chocolate Factory, Jr. — all bands camp.
  charlie: "camp",
  // Broadway Bound | Trolls, Jr. — all bands camp.
  trolls: "camp",
  // Broadway Bound | How to Train Your Dragon, Jr. — all bands camp.
  httyd: "camp",
};

/** The category for a show code, or undefined when we have not verified one. */
export function categoryForShowCode(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return SHOW_CODE_CATEGORY[code.trim().toLowerCase()];
}
