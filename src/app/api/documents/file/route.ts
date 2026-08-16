import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/api/supabase/client";
import { corsHeaders, userFromBearer } from "@/lib/auth/portal-bridge";
import { getSessionUser } from "@/lib/auth/session";

/**
 * Hand out a short-lived signed URL for one vault document.
 *
 * The family-documents bucket is private on purpose — a waiver or a custody
 * order must never be a guessable public URL. This endpoint is the only
 * door: it authenticates the caller (hub session cookie or the staff
 * portal's Bearer token), checks THEY may see THIS document (staff, or a
 * parent of the family it belongs to), and mints a 10-minute signed URL.
 */
export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(request: NextRequest) {
  const user = (await getSessionUser()) ?? (await userFromBearer(request));
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const documentId = request.nextUrl.searchParams.get("id") ?? "";
  if (!documentId) {
    return NextResponse.json({ error: "id is required" }, { status: 400, headers: corsHeaders() });
  }

  const db = getServiceClient();
  const { data: doc } = await db
    .from("family_documents")
    .select("family_id, storage_path, name")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders() });
  }

  const isStaff = ["staff", "admin", "super_admin"].includes(user.role);
  if (!isStaff && user.familyId !== String(doc.family_id)) {
    return NextResponse.json({ error: "Not your document" }, { status: 403, headers: corsHeaders() });
  }

  const bucket = `${process.env.SUPABASE_BUCKET_PREFIX ?? "fh-"}family-documents`;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${url}/storage/v1/object/sign/${bucket}/${doc.storage_path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key ?? "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 600 }),
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: `Could not sign (${response.status})` },
      { status: 502, headers: corsHeaders() }
    );
  }
  const signed = (await response.json()) as { signedURL?: string };
  if (!signed.signedURL) {
    return NextResponse.json({ error: "Could not sign" }, { status: 502, headers: corsHeaders() });
  }

  return NextResponse.json(
    { url: `${url}/storage/v1${signed.signedURL}`, name: doc.name },
    { headers: corsHeaders() }
  );
}
