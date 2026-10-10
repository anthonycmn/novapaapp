import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Star } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { starPageFileName, starPageRows } from "@/lib/star-page-orders";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Star page orders" };

/**
 * Every star page a family has bought: the show, the performer, the size, the
 * message and signature exactly as written, and the page the family approved
 * (drawn at 300 DPI in their browser; this file goes to the playbill).
 *
 * No status buttons here. The order status lives on Button orders, where
 * "ready" and "delivered" notify a family to collect something - which a
 * page printed in the playbill never is. See lib/star-page-orders.
 */
export default async function StarPageOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; unpaid?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { show, unpaid } = await searchParams;
  const includeUnpaid = unpaid === "1";

  const provider = getProvider();
  const [orders, products, productions] = await Promise.all([
    provider.getAllOrders(user.id),
    provider.getProducts(),
    provider.getProductions(),
  ]);
  const rows = starPageRows(orders, products, productions);

  const paid = rows.filter((row) => row.paid);
  const revenue = paid.reduce((sum, row) => sum + row.cents, 0);
  const unpaidCount = rows.length - paid.length;
  const shows = [...new Map(rows.filter((r) => r.showId).map((r) => [r.showId!, r.show])).entries()]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const activeShow = shows.some((s) => s.id === show) ? show : undefined;

  const visible = rows.filter(
    (row) => (!activeShow || row.showId === activeShow) && (includeUnpaid || row.paid)
  );

  const href = (next: { show?: string; unpaid?: boolean }) => {
    const params = new URLSearchParams();
    if (next.show) params.set("show", next.show);
    if (next.unpaid) params.set("unpaid", "1");
    const query = params.toString();
    return `/admin/store/star-page-orders${query ? `?${query}` : ""}`;
  };
  const manifestQuery = new URLSearchParams({
    ...(activeShow ? { show: activeShow } : {}),
    ...(includeUnpaid ? { unpaid: "1" } : {}),
  }).toString();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Star page orders</h1>
          <p className="text-muted-foreground">
            {paid.length} paid page{paid.length === 1 ? "" : "s"} · {formatCents(revenue)}
            {unpaidCount > 0 && ` · ${unpaidCount} unpaid, not counted`}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/store/star-pages"
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
          >
            <Star aria-hidden className="size-4" />
            Star page artwork
          </Link>
          <a
            href={`/api/store/star-page-manifest${manifestQuery ? `?${manifestQuery}` : ""}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Download aria-hidden className="size-4" />
            Playbill CSV
          </a>
        </div>
      </div>

      {rows.length > 0 && (
        <nav aria-label="Filter star pages" className="flex flex-wrap gap-2">
          <Link
            href={href({ unpaid: includeUnpaid })}
            className={`rounded-full border px-3 py-1.5 text-sm ${!activeShow ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            Every show
          </Link>
          {shows.map((option) => (
            <Link
              key={option.id}
              href={href({ show: option.id, unpaid: includeUnpaid })}
              className={`rounded-full border px-3 py-1.5 text-sm ${activeShow === option.id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
            >
              {option.title}
            </Link>
          ))}
          <Link
            href={href({ show: activeShow, unpaid: !includeUnpaid })}
            className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {includeUnpaid ? "Paid only" : "Include unpaid"}
          </Link>
        </nav>
      )}

      {visible.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No star pages bought yet. A show sells star pages once its graphic is uploaded on Star page artwork."
              : "Nothing in this view. Include unpaid or pick another show."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((row) => (
            <Card key={row.itemId}>
              <CardContent className="flex gap-3 p-4">
                {row.printImageUrl || row.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.printImageUrl || row.photoUrl}
                    alt={`Star page for ${row.performer}`}
                    className="w-24 shrink-0 self-start rounded-md border object-cover shadow-sm"
                    loading="lazy"
                  />
                ) : (
                  <div className="aspect-[5/8] w-24 shrink-0 rounded-md bg-muted" />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{row.performer}</span>
                    <Badge variant="secondary">{row.sizeLabel}</Badge>
                    {row.quantity > 1 && <Badge variant="outline">×{row.quantity}</Badge>}
                    {row.paid ? (
                      <Badge>Paid</Badge>
                    ) : (
                      <Badge variant="destructive">Unpaid</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {row.show} · {row.placedBy} · {row.reference} · {formatCents(row.cents)} ·{" "}
                    {formatDate(row.createdAt)}
                  </p>
                  {row.message && (
                    <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted px-2 py-1.5">
                      {row.message}
                    </p>
                  )}
                  {row.signature && <p className="mt-1 italic">{row.signature}</p>}
                  {row.printImageUrl && (
                    <a
                      href={row.printImageUrl}
                      download={starPageFileName(row)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                    >
                      <Download aria-hidden className="size-3" />
                      Print file
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
