import Link from "next/link";
import { redirect } from "next/navigation";
import { Package } from "lucide-react";
import { getProvider } from "@/lib/api";
import { isButtonLine, type OrderStatus } from "@/lib/api/types";
import { getSessionUser } from "@/lib/auth/session";
import { reorderAction } from "@/lib/actions/store";
import { formatCents, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonPreview } from "@/components/store/button-preview";

export const metadata = { title: "Your orders" };

const STATUS_LABEL: Record<OrderStatus, string> = {
  new: "Received",
  in_production: "Being made",
  ready: "Ready for pickup",
  delivered: "Delivered",
};

const STATUS_VARIANT: Record<OrderStatus, "secondary" | "gold" | "default"> = {
  new: "secondary",
  in_production: "gold",
  ready: "default",
  delivered: "secondary",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ placed?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.familyId) redirect("/store");

  const { placed } = await searchParams;
  const provider = getProvider();
  const [orders, templates] = await Promise.all([
    provider.getOrdersForFamily(user.id, user.familyId),
    provider.getButtonTemplates(),
  ]);
  const templatesById = new Map(templates.map((t) => [t.id, t]));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Your orders</h1>

      {placed && (
        <Card className="border-primary/40">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Order {placed} placed — thank you! 🎉</p>
            <p className="text-muted-foreground">
              We&apos;ll let you know as soon as your buttons are ready.
            </p>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <Package aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">No orders yet</p>
            <Link
              href="/store"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Design your first button
            </Link>
          </CardContent>
        </Card>
      ) : (
        orders.map((order) => (
          <Card key={order.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{order.reference}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(order.createdAt)} · {formatCents(order.subtotalCents)}
                    {!order.paidAt && " · payment pending"}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[order.status]}>
                  {STATUS_LABEL[order.status]}
                </Badge>
              </div>

              <div className="flex flex-wrap gap-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center gap-2">
                    {isButtonLine(item) ? (
                      <ButtonPreview
                        photoUrl={item.photoUrl}
                        printImageUrl={item.printImageUrl}
                        studentName={item.studentName}
                        role={item.role}
                        size={item.size}
                        style={item.style}
                        template={templatesById.get(item.templateId)}
                        className="!w-16 !h-16"
                      />
                    ) : (
                      <span className="text-sm font-medium">{item.displayName}</span>
                    )}
                    <span className="text-sm text-muted-foreground">×{item.quantity}</span>
                  </div>
                ))}
              </div>

              {order.adminNote && (
                <p className="text-sm text-muted-foreground">Note: {order.adminNote}</p>
              )}

              <form action={reorderAction.bind(null, order.id)}>
                <Button type="submit" variant="outline" size="sm">
                  Reorder
                </Button>
              </form>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
