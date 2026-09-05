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
export default async function ButtonTemplatesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "admin")) redirect("/dashboard");

  const provider = getProvider();
  const [productions, templates] = await Promise.all([
    provider.getProductions(),
    provider.getButtonTemplates(),
  ]);
  const templateByProduction = new Map(templates.map((t) => [t.productionId, t]));

  const rows = [...productions].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Button artwork</h1>
        <p className="text-muted-foreground">
          Upload each show&apos;s background. Families see their performer cut
          out and standing on it, exactly as it will print.
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
    </div>
  );
}
