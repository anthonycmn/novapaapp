import { redirect } from "next/navigation";

/**
 * The old combined "star pages & lessons" page. Star pages moved in with
 * spirit buttons (/store); lessons got their own page. This stub keeps old
 * links and notifications working. The catalog-form component still lives
 * in this folder and is shared by both successor pages.
 */
export default function CatalogRedirect() {
  redirect("/store/lessons");
}
