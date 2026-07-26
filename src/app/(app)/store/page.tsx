import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ButtonDesigner } from "./designer";

export const metadata = { title: "Spirit buttons" };

/** Spirit buttons store (#11): design, preview, and add to cart. */
export default async function StorePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const [templates, productions, cart] = await Promise.all([
    provider.getButtonTemplates(),
    provider.getProductions(),
    provider.getCart(user.id),
  ]);
  const students = user.familyId
    ? await provider.getStudentsForFamily(user.id, user.familyId)
    : [];

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Spirit buttons</h1>
          <p className="text-muted-foreground">
            Show your performer some love on opening night.
          </p>
        </div>
        <Link
          href="/store/cart"
          className="relative inline-flex size-11 items-center justify-center rounded-lg border hover:bg-accent"
          aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
        >
          <ShoppingCart aria-hidden className="size-5" />
          {cartCount > 0 && (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground"
            >
              {cartCount}
            </span>
          )}
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No button designs are available right now. They go live when a show
            is announced.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">
              Design your button
            </CardTitle>
            <CardDescription>
              The preview updates as you go — that&apos;s exactly what gets pressed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ButtonDesigner
              templates={templates}
              productions={productions}
              students={students}
            />
          </CardContent>
        </Card>
      )}

      <Link
        href="/store/orders"
        className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        View past orders
      </Link>
    </div>
  );
}
