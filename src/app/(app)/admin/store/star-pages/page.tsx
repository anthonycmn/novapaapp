import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { StarPageArtworkForm } from "./artwork-form";
import { starPageOnSale } from "@/lib/api/store/catalog";

export const metadata = { title: "Star page artwork" };

/**
 * Per-show star page graphic (CJ, 8 Oct 2026): "I will upload the graphic and
 * then they can upload the photo and text and it will show them what it will
 * look like."
 *
 * One card per show that sells star pages. A show goes on sale to its own
 * families the moment its graphic is saved here, and comes off sale if the
 * graphic is removed - the graphic IS the switch, so there is no second one
 * to forget.
 */
export default async function StarPageArtworkPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/dashboard");

  const provider = getProvider();
  const [products, productions] = await Promise.all([
    provider.getProducts(),
    provider.getProductions(),
  ]);
  const titleById = new Map(productions.map((production) => [production.id, production.title]));

  const rows = products
    .filter((product) => product.type === "star_page" && product.productionId)
    .map((product) => ({
      product,
      title: titleById.get(product.productionId!) ?? product.name.replace(/ star page$/, ""),
    }))
    .sort((a, b) => {
      // Shows still waiting for a graphic first: that is the to-do list.
      const aOn = starPageOnSale(a.product);
      if (aOn !== starPageOnSale(b.product)) return aOn ? 1 : -1;
      return a.title.localeCompare(b.title);
    });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Star page artwork</h1>
        <p className="text-muted-foreground">
          Upload each show&apos;s graphic for the quarter, half and full page, with
          the photo spaces drawn on as black boxes. Families in that show put their
          photos in those boxes, choose a font and color for their words, see the
          finished page, and buy it. Only sizes with a graphic are on sale.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shows sell star pages yet.</p>
      ) : (
        <div className="grid gap-3">
          {rows.map(({ product, title }) => (
            <StarPageArtworkForm key={product.id} product={product} title={title} />
          ))}
        </div>
      )}
    </div>
  );
}
