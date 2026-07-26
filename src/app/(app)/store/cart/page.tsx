import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getPaymentProvider } from "@/lib/api/payments";
import { getSessionUser } from "@/lib/auth/session";
import { checkoutAction } from "@/lib/actions/store";
import { formatCents } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CartItems } from "./cart-items";

export const metadata = { title: "Cart" };

export default async function CartPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const [cart, templates, productions] = await Promise.all([
    provider.getCart(user.id),
    provider.getButtonTemplates(),
    provider.getProductions(),
  ]);

  const subtotal = cart.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0
  );
  const payments = getPaymentProvider();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Your cart</h1>

      {cart.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ShoppingCart aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">Your cart is empty</p>
            <Link
              href="/store"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Design a spirit button
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <CartItems items={cart} templates={templates} productions={productions} />

          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <p className="font-semibold">Subtotal</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatCents(subtotal)}
              </p>
            </CardContent>
          </Card>

          {!payments.isConfigured() && (
            <p className="rounded-lg bg-accent p-3 text-sm text-accent-foreground">
              Payments are in demo mode — checkout completes without charging a
              card. Add a Stripe key to take real payments.
            </p>
          )}

          <form action={checkoutAction}>
            <Button type="submit" size="lg" className="w-full">
              Checkout · {formatCents(subtotal)}
            </Button>
          </form>

          <Link
            href="/store"
            className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Add another button
          </Link>
        </>
      )}
    </div>
  );
}
