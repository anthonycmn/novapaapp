import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CatalogItemForm } from "./catalog/catalog-form";
import { ButtonDesigner } from "./designer";
import { NotYetAvailable } from "@/components/not-yet-available";
import { isFeatureOpen } from "@/lib/feature-availability";

export const metadata = { title: "Spirit buttons & star pages" };

/** Spirit buttons store (#11): design, preview, and add to cart. */
export default async function StorePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const [templates, productions, cart, products, staff] = await Promise.all([
    provider.getButtonTemplates(),
    provider.getProductions(),
    provider.getCart(user.id),
    provider.getProducts(),
    provider.getStaffProfiles(),
  ]);
  const students = user.familyId
    ? await provider.getStudentsForFamily(user.id, user.familyId)
    : [];
  // Show-week keepsakes live together on this page; coaching is separate.
  const starPages = products.filter((product) => product.type === "star_page");

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Spirit buttons &amp; star pages</h1>
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

      {/* Spirit buttons — closed to families for now (lib/store-availability).
          The designer is left intact behind the switch rather than removed, so
          opening it again is one boolean. */}
      {!isFeatureOpen("spiritButtons") ? (
        <NotYetAvailable feature="spiritButtons" />
      ) : templates.length === 0 ? (
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

      {/* Star pages — same switch, same reason. */}
      {!isFeatureOpen("starPages") ? (
        <NotYetAvailable feature="starPages" />
      ) : (
        <>
        {starPages.map((product) => (
          <Card key={product.id}>
            <CardHeader className="pb-2">
              <CardTitle as="h2" className="flex items-center gap-2 text-base">
                <span aria-hidden>⭐</span>
                {product.name}
              </CardTitle>
              <CardDescription>{product.description}</CardDescription>
              <p className="text-sm font-medium">
                From {formatCents(product.basePriceCents)}
              </p>
            </CardHeader>
            <CardContent>
              <CatalogItemForm product={product} students={students} staff={staff} />
            </CardContent>
          </Card>
        ))}
        </>
      )}

      <div className="flex flex-col items-center gap-2 text-sm font-medium">
        <Link
          href="/store/lessons"
          className="text-primary underline-offset-4 hover:underline"
        >
          Looking for private voice, acting, or dance lessons? →
        </Link>
        <Link
          href="/store/orders"
          className="text-primary underline-offset-4 hover:underline"
        >
          View past orders
        </Link>
      </div>
    </div>
  );
}
