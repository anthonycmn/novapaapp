"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeCartItemAction, updateCartItemAction } from "@/lib/actions/store";
import type { ButtonTemplate, CartItem, Production } from "@/lib/api/types";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonPreview } from "@/components/store/button-preview";

export function CartItems({
  items,
  templates,
  productions,
}: {
  items: CartItem[];
  templates: ButtonTemplate[];
  productions: Production[];
}) {
  const [pending, startTransition] = useTransition();
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const productionsById = new Map(productions.map((p) => [p.id, p]));

  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => {
        const template = templatesById.get(item.templateId);
        const production = template
          ? productionsById.get(template.productionId)
          : undefined;
        return (
          <li key={item.id}>
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                <ButtonPreview
                  photoUrl={item.photoUrl}
                  studentName={item.studentName}
                  role={item.role}
                  size={item.size}
                  style={item.style}
                  template={template}
                  showTitle={production?.title}
                  className="!w-20 !h-20 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.studentName}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {item.role || "No role"} · {item.size}&quot; {item.style}
                  </p>
                  <p className="text-sm">
                    {formatCents(item.unitPriceCents)} each
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      aria-label={`Decrease quantity for ${item.studentName}`}
                      onClick={() =>
                        startTransition(() =>
                          updateCartItemAction(item.id, item.quantity - 1).then(() => {})
                        )
                      }
                    >
                      −
                    </Button>
                    <span className="min-w-8 text-center tabular-nums">{item.quantity}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      aria-label={`Increase quantity for ${item.studentName}`}
                      onClick={() =>
                        startTransition(() =>
                          updateCartItemAction(item.id, item.quantity + 1).then(() => {})
                        )
                      }
                    >
                      +
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`Remove ${item.studentName} from cart`}
                      onClick={() =>
                        startTransition(() => removeCartItemAction(item.id).then(() => {}))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">
                  {formatCents(item.unitPriceCents * item.quantity)}
                </p>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
