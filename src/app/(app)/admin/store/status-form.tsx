"use client";

import { updateOrderStatusAction } from "@/lib/actions/store";
import type { OrderStatus } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Advance an order through new → in production → ready → delivered. */
const NEXT_STATUS: Record<OrderStatus, { next?: OrderStatus; label: string }> = {
  new: { next: "in_production", label: "Start production" },
  in_production: { next: "ready", label: "Mark ready" },
  ready: { next: "delivered", label: "Mark delivered" },
  delivered: { label: "Delivered" },
};

export function StatusForm({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const step = NEXT_STATUS[status];

  return (
    <form className="flex flex-wrap items-center gap-2">
      <Input name="note" placeholder="Note to the family (optional)" className="min-w-40 flex-1" />
      {step.next && (
        <Button
          type="submit"
          size="sm"
          formAction={updateOrderStatusAction.bind(null, orderId, step.next)}
        >
          {step.label}
        </Button>
      )}
      {status !== "new" && (
        <Button
          type="submit"
          size="sm"
          variant="ghost"
          formAction={updateOrderStatusAction.bind(null, orderId, "new")}
        >
          Reset
        </Button>
      )}
    </form>
  );
}
