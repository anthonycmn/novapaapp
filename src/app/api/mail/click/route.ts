import { NextRequest, NextResponse } from "next/server";
import { recordMailEvent, verifyLink, visitorOf } from "@/lib/email/audit";

/**
 * The email audit's click redirect (staff portal 0338):
 * /api/mail/click?m=<ledger id>&u=<url>&s=<signature>.
 *
 * Signed, because an unsigned redirect on our domain is a phishing tool. A
 * link that does not verify lands on the app instead of anywhere it names.
 * A good link always reaches its destination, recorded or not.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const id = q.get("m") ?? "";
  const url = q.get("u") ?? "";
  const sig = q.get("s") ?? "";

  if (!UUID.test(id) || !/^https?:\/\//i.test(url) || !verifyLink(id, url, sig)) {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  await recordMailEvent({
    message_id: id,
    type: "clicked",
    source: "redirect",
    link: url.slice(0, 2000),
    ...visitorOf(request.headers),
  });
  return NextResponse.redirect(url);
}
