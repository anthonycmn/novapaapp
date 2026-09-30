import { getWebsiteAnonClient } from "@/lib/api/supabase/client";
import { buildCatalog, type CatalogRow } from "@/lib/registration/catalog-view";
import RegisterApp from "./register-app";

/**
 * /register — browse, cart, check out, and you're in (CJ, 30 Sep 2026).
 *
 * The catalog is read live on every visit from public.catalog_list with the
 * anon key, exactly as novapa.org reads it, so what is published from the
 * staff portal's Draft & Publish shows here at once. ?activity=1,2 opens with
 * those listings in the cart, including hidden ones sold by direct link.
 */
export const dynamic = "force-dynamic";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; ref?: string; paid?: string }>;
}) {
  const { activity, ref, paid } = await searchParams;
  const ids = (activity ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 12);

  let rows: CatalogRow[] = [];
  let loadError: string | null = null;
  try {
    const { data, error } = await getWebsiteAnonClient().rpc("catalog_list", { p_ids: ids.length ? ids : null });
    if (error) throw new Error(error.message);
    rows = (data ?? []) as CatalogRow[];
  } catch (e) {
    console.error("register: catalog_list failed:", e);
    loadError = "We couldn't load what's open right now. Please refresh in a moment.";
  }

  return (
    <RegisterApp
      catalog={buildCatalog(rows)}
      preselect={ids}
      loadError={loadError}
      refCode={ref && /^[A-Za-z0-9]{1,20}$/.test(ref) ? ref : undefined}
      returnedFromBank={paid === "1"}
      stripeKey={process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""}
      summerUrl="https://www.northernvirginiaperformingarts.org/register/"
      freeClassUrl="https://www.northernvirginiaperformingarts.org/free-class/"
    />
  );
}
