import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Download, Printer } from "lucide-react";
import { getProvider } from "@/lib/api";
import type { OrderStatus } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { assessPhotoQuality } from "@/lib/store-rules";
import { countButtons } from "@/lib/button-manifest";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonPreview } from "@/components/store/button-preview";
import { StatusForm } from "./status-form";

export const metadata = { title: "Button orders" };

const STATUSES: OrderStatus[] = ["new", "in_production", "ready", "delivered"];
const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  in_production: "In production",
  ready: "Ready",
  delivered: "Delivered",
};

/** Admin fulfillment queue (#11). */
export default async function StoreAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { status } = await searchParams;
  const activeStatus = STATUSES.includes(status as OrderStatus)
    ? (status as OrderStatus)
    : undefined;

  const provider = getProvider();
  const [orders, allOrders, templates] = await Promise.all([
    provider.getAllOrders(user.id, activeStatus),
    provider.getAllOrders(user.id),
    provider.getButtonTemplates(),
  ]);
  const templatesById = new Map(templates.map((t) => [t.id, t]));

  const countByStatus = (target: OrderStatus) =>
    allOrders.filter((order) => order.status === target).length;

  const query = activeStatus ? `?status=${activeStatus}` : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Button orders</h1>
          <p className="text-muted-foreground">
            {countButtons(orders)} button{countButtons(orders) === 1 ? "" : "s"} in view
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/store/manifest${query}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-semibold hover:bg-accent"
          >
            <Download aria-hidden className="size-4" />
            CSV manifest
          </a>
          <Link
            href={`/admin/store/print${query}`}
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Printer aria-hidden className="size-4" />
            Print sheet
          </Link>
        </div>
      </div>

      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        <Link
          href="/admin/store"
          className={`rounded-full border px-3 py-1.5 text-sm ${!activeStatus ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
        >
          All ({allOrders.length})
        </Link>
        {STATUSES.map((option) => (
          <Link
            key={option}
            href={`/admin/store?status=${option}`}
            className={`rounded-full border px-3 py-1.5 text-sm ${activeStatus === option ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            {STATUS_LABEL[option]} ({countByStatus(option)})
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No orders in this view yet.
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => {
          const lowRes = order.items.some(
            (item) =>
              assessPhotoQuality(item.photoWidth, item.photoHeight, item.size).quality ===
              "low"
          );
          return (
            <Card key={order.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{order.reference}</CardTitle>
                    <CardDescription>
                      {order.placedByName} · {formatDate(order.createdAt)} ·{" "}
                      {formatCents(order.subtotalCents)}
                      {!order.paidAt && " · UNPAID"}
                    </CardDescription>
                  </div>
                  <Badge variant={order.status === "delivered" ? "secondary" : "default"}>
                    {STATUS_LABEL[order.status]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-0">
                {lowRes && (
                  <p className="flex items-center gap-1.5 text-sm text-destructive">
                    <AlertTriangle aria-hidden className="size-4" />
                    Contains a low-resolution photo — check before pressing.
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center gap-2">
                      <ButtonPreview
                        photoUrl={item.photoUrl}
                        studentName={item.studentName}
                        role={item.role}
                        size={item.size}
                        style={item.style}
                        template={templatesById.get(item.templateId)}
                        className="!w-16 !h-16"
                      />
                      <div className="text-sm">
                        <p className="font-medium">×{item.quantity}</p>
                        <p className="text-muted-foreground">{item.size}&quot;</p>
                      </div>
                    </div>
                  ))}
                </div>

                {order.adminNote && (
                  <p className="text-sm text-muted-foreground">Note: {order.adminNote}</p>
                )}

                <StatusForm orderId={order.id} status={order.status} />
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
