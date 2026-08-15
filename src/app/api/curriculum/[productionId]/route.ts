import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api/supabase/client";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { canAccessShow } from "@/lib/staff-shows";

/**
 * Staff-only curriculum delivery. The curriculum carries pricing, purchase
 * lists and internal production notes, so it is NEVER public: the storage
 * bucket is private and this route is the only way to it. Access = staff
 * assigned to the show, or admins/super admins (who see every show).
 * Families never see this — their view of a show is its schedule.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productionId: string }> }
): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const { productionId } = await params;
  if (!(await canAccessShow(user, productionId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const db = getServiceClient();
  const { data: production } = await db
    .from("productions")
    .select("curriculum_url")
    .eq("id", productionId)
    .maybeSingle();
  const url = production?.curriculum_url ? String(production.curriculum_url) : null;
  if (!url) return new NextResponse("No curriculum published", { status: 404 });

  // Files in our private bucket stream through with the service key;
  // anything else (e.g. a curriculum hosted on the org website) redirects.
  const marker = "/fh-curriculum/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) {
    return NextResponse.redirect(url);
  }
  const path = url.slice(markerIndex + marker.length).split("?")[0];
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const fileResponse = await fetch(
    `${base}/storage/v1/object/fh-curriculum/${path}`,
    { headers: { Authorization: `Bearer ${key}`, apikey: key ?? "" } }
  );
  if (!fileResponse.ok) {
    return new NextResponse("Curriculum file unavailable", { status: 502 });
  }
  const bytes = await fileResponse.arrayBuffer();
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": fileResponse.headers.get("content-type") ?? "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
    },
  });
}
