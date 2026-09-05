import { redirect } from "next/navigation";

/**
 * /calendar never existed — the page is /schedule — but months of stored
 * notifications carried url:"/calendar" (fixed at the producers, Sep 5 2026
 * audit), and a notification row is forever: it sits in a parent's list and
 * must keep working long after the bug that wrote it is gone. Same rule as
 * the /productions redirect: routes referenced by stored URLs get a
 * forwarding address, not a 404.
 */
export default function CalendarRedirect() {
  redirect("/schedule");
}
