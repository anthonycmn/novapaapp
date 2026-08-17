import { redirect } from "next/navigation";

/**
 * "Productions" split into Shows and Classes on 17 Aug 2026.
 *
 * The index moved; the detail pages did NOT. /productions/:id is written into
 * notification rows already in the database, into calendar links, and into
 * whatever families have bookmarked — moving it would break every one of them
 * for a URL nobody reads. So only this listing redirects.
 */
export default function ProductionsIndexRedirect() {
  redirect("/shows");
}
