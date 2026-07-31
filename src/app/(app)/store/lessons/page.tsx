import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatCents } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/states";
import { CatalogItemForm } from "../catalog/catalog-form";

export const metadata = { title: "Private lessons" };

/**
 * Private coaching only — deliberately its own page, separate from the
 * show-week keepsakes (buttons and star pages), per org preference.
 */
export default async function LessonsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const [products, staff, cart] = await Promise.all([
    provider.getProducts(),
    provider.getStaffProfiles(),
    provider.getCart(user.id),
  ]);
  const students = user.familyId
    ? await provider.getStudentsForFamily(user.id, user.familyId)
    : [];

  const lessons = products.filter((product) => product.type === "private_lesson");
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Private lessons</h1>
          <p className="text-muted-foreground">
            One-to-one voice, acting, and dance coaching with NOVA PA teaching
            artists.
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

      {lessons.length === 0 ? (
        <EmptyState
          title="No lesson packages available right now"
          description="Check back soon, or message the office."
        />
      ) : (
        lessons.map((product) => (
          <Card key={product.id}>
            <CardHeader className="pb-2">
              <CardTitle as="h2" className="flex items-center gap-2 text-base">
                <span aria-hidden>🎤</span>
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
        ))
      )}

      <Link
        href="/store"
        className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Spirit buttons &amp; star pages →
      </Link>
    </div>
  );
}
