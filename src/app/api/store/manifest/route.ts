import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import type { OrderStatus } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { buildManifestCsv } from "@/lib/button-manifest";

/** CSV manifest download for the button press operator (#11). Staff only. */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status") as OrderStatus | null;
  const orders = await getProvider().getAllOrders(user.id, status ?? undefined);
  const csv = buildManifestCsv(orders);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="button-manifest-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
