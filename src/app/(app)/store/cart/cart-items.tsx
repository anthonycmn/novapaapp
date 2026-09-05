"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { removeCartItemAction, updateCartItemAction } from "@/lib/actions/store";
import { isButtonLine, type ButtonTemplate, type CartItem, type Production } from "@/lib/api/types";
import { describeCustomization } from "@/lib/api/store/catalog";
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
        const button = isButtonLine(item) ? item : null;
        const template = button ? templatesById.get(button.templateId) : undefined;
        const production = template
          ? productionsById.get(template.productionId)
          : undefined;
        return (
          <li key={item.id}>
            <Card>
              <CardContent className="flex items-center gap-4 p-4">
                {button ? (
                  <ButtonPreview
                    photoUrl={button.photoUrl}
                    printImageUrl={button.printImageUrl}
                    studentName={button.studentName}
                    role={button.role}
                    size={button.size}
                    style={button.style}
                    template={template}
                    showTitle={production?.title}
                    className="!w-20 !h-20 shrink-0"
                  />
                ) : (
                  <span aria-hidden className="text-3xl">
                    {item.productType === "star_page" ? "⭐" : "🎤"}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {button ? button.studentName : item.displayName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {button
                      ? `${button.role || "No role"} · ${button.size}" ${button.style}`
                      : describeCustomization(item.customization ?? { kind: "simple" })}
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
