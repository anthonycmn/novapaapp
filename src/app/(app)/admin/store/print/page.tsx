import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { isButtonLine, type OrderStatus } from "@/lib/api/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { assessPhotoQuality } from "@/lib/store-rules";
import { countButtons } from "@/lib/button-manifest";
import { ButtonPreview } from "@/components/store/button-preview";

export const metadata = { title: "Print sheet" };

/**
 * Print-ready sheet (#11). Buttons render at true physical inches via CSS,
 * so pressing straight from the browser gives correctly sized artwork with
 * no image pipeline. Each button repeats once per unit ordered.
 *
 * A raster compositing step (sharp → PNG per button) is the upgrade path
 * once a real storage backend exists; see DECISIONS.md.
 */
export default async function PrintSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { status } = await searchParams;
  const provider = getProvider();
  const [orders, templates, productions] = await Promise.all([
    provider.getAllOrders(user.id, (status as OrderStatus) ?? undefined),
    provider.getButtonTemplates(),
    provider.getProductions(),
  ]);
  const templatesById = new Map(templates.map((t) => [t.id, t]));
  const productionsById = new Map(productions.map((p) => [p.id, p]));

  const total = countButtons(orders);

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold">Print sheet</h1>
        <p className="text-muted-foreground">
          {total} button{total === 1 ? "" : "s"} across {orders.length} order
          {orders.length === 1 ? "" : "s"}
          {status ? ` · ${status.replace("_", " ")}` : ""}. Print at 100% scale
          (no “fit to page”) so sizes stay true.
        </p>
      </div>

      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground print:hidden">
          Nothing to print for this filter.
        </p>
      ) : (
        orders.map((order) => (
          <section key={order.id} className="break-inside-avoid">
            <h2 className="mb-2 text-sm font-semibold">
              {order.reference} · {order.placedByName}
            </h2>
            <div className="flex flex-wrap gap-3">
              {/* Only buttons are pressed — other products don't print here. */}
              {order.items.filter(isButtonLine).flatMap((item) => {
                const template = templatesById.get(item.templateId);
                const production = template
                  ? productionsById.get(template.productionId)
                  : undefined;
                const quality = assessPhotoQuality(
                  item.photoWidth,
                  item.photoHeight,
                  item.size
                );
                return Array.from({ length: item.quantity }, (_, copy) => (
                  <div key={`${item.id}-${copy}`} className="flex flex-col items-center">
                    <ButtonPreview
                      photoUrl={item.photoUrl}
                      studentName={item.studentName}
                      role={item.role}
                      size={item.size}
                      style={item.style}
                      template={template}
                      showTitle={production?.title}
                      printInches
                    />
                    <p className="mt-0.5 text-[8px] text-muted-foreground print:text-black">
                      {order.reference} · {item.size}&quot;
                      {quality.quality !== "good" && ` · ⚠ ${quality.dpi} DPI`}
                    </p>
                  </div>
                ));
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
