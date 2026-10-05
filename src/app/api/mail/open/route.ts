import { NextRequest, NextResponse } from "next/server";
import { recordMailEvent, visitorOf } from "@/lib/email/audit";

/**
 * The email audit's open pixel (staff portal 0338): /api/mail/open?m=<ledger id>.
 *
 * Records IP, device and the city Netlify's edge resolves the IP to — the
 * "where they opened it from" CJ asked for. Gmail and Apple Mail fetch images
 * through proxies; the staff portal's audit page says so beside the row.
 *
 * Separate from /api/email/open, which counts opens per family-desk send and
 * carries no IP. Always the image, even for a bad id.
 */
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("m") ?? "";
  if (UUID.test(id)) {
    await recordMailEvent({
      message_id: id,
      type: "opened",
      source: "pixel",
      ...visitorOf(request.headers),
    });
  }
  return new NextResponse(new Uint8Array(PIXEL), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}
