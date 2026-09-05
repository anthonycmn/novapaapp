import { redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { TemplateForm } from "./template-form";

export const metadata = { title: "Button artwork" };

/**
 * Per-show spirit-button artwork (hub 0066).
 *
 * One card per production: the background a family's cutout will stand on,
 * the accent, and a live sample drawn by the same renderer the parent form
 * and the print file use — so what an admin approves here is what a family
 * sees and what the press receives.
 */
export default async function ButtonTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/dashboard");
  const { add } = await searchParams;

  const provider = getProvider();
  const [productions, templates] = await Promise.all([
    provider.getProductions(),
    provider.getButtonTemplates(),
  ]);
  const templateByProduction = new Map(templates.map((t) => [t.productionId, t]));

  /*
   * Shows only — CJ, 5 Sep 2026: "only do the shows, not the classes or day
   * camps." The productions table carries every registration offering, camps
   * and workshops included, and nothing in the schema says which rows are
   * shows. What does say so is the template set itself: artwork exists for
   * exactly the shows. So the desk lists the shows it already dresses, and a
   * NEW show joins through the picker below — a deliberate act, instead of
   * ninety camp cards nobody should ever fill in.
   */
  const rows = productions
    .filter((production) => templateByProduction.has(production.id) || production.id === add)
    .sort((a, b) => a.title.localeCompare(b.title));
  const addable = productions
    .filter((production) => !templateByProduction.has(production.id) && production.id !== add)
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Button artwork</h1>
        <p className="text-muted-foreground">
          Upload each show&apos;s background — include the show title in the
          artwork itself. Families see their performer standing on it, exactly
          as it will print.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((production) => (
          <TemplateForm
            key={production.id}
            production={production}
            template={templateByProduction.get(production.id)}
          />
        ))}
      </div>

      {addable.length > 0 && (
        <form action="/admin/store/templates" method="get" className="flex flex-wrap items-center gap-2">
          <label htmlFor="add-show" className="text-sm text-muted-foreground">
            Add artwork for another show
          </label>
          <select id="add-show" name="add" className="h-9 rounded-md border bg-transparent px-2 text-sm">
            {addable.map((production) => (
              <option key={production.id} value={production.id}>
                {production.title}
              </option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-md border px-3 text-sm font-medium hover:bg-muted">
            Add
          </button>
        </form>
      )}
    </div>
  );
}
