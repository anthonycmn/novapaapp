import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { buildStarPageManifestCsv, starPageRows } from "@/lib/star-page-orders";

/**
 * CSV of star pages for the playbill designer - same filters as
 * /admin/store/star-page-orders (?show=<production id>, ?unpaid=1). Staff only.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRoleAtLeast(user, "staff")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const show = request.nextUrl.searchParams.get("show");
  const includeUnpaid = request.nextUrl.searchParams.get("unpaid") === "1";

  const provider = getProvider();
  const [orders, products, productions] = await Promise.all([
    provider.getAllOrders(user.id),
    provider.getProducts(),
    provider.getProductions(),
  ]);
  const rows = starPageRows(orders, products, productions).filter(
    (row) => (!show || row.showId === show) && (includeUnpaid || row.paid)
  );
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buildStarPageManifestCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="star-pages-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
