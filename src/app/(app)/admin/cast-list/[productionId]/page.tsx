import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { ROLE_TIERS } from "@/lib/api/auditions/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cast list status" };

/**
 * The whole cast list at a glance, for playbill and registration tracking:
 * gray = open, yellow = filled (family hasn't confirmed), green = accepted
 * (playbill name confirmed). Understudies listed but never gate the pill.
 */
export default async function CastListPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const { productionId } = await params;
  const provider = getProvider();
  const production = await provider.getProduction(productionId);
  if (!production) notFound();

  const [rows, scenes] = await Promise.all([
    provider.getCastListStatus(user.id, productionId),
    provider.getShowScenes(productionId),
  ]);
  const tierLabel = new Map(ROLE_TIERS.map((tier) => [tier.value, tier.label]));
  const roleNameById = new Map(rows.map(({ role }) => [role.id, role.name]));

  const counts = {
    accepted: rows.filter((row) => row.status === "accepted").length,
    filled: rows.filter((row) => row.status === "filled").length,
    open: rows.filter((row) => row.status === "open").length,
  };

  const PILL: Record<string, string> = {
    // Colors are explicit brand-agnostic status colors; text stays dark for
    // contrast on both themes.
    open: "bg-muted text-muted-foreground",
    filled: "bg-yellow-300 text-yellow-950",
    accepted: "bg-green-400 text-green-950",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Cast list — {production.title}</h1>
          <p className="text-muted-foreground">
            {counts.accepted} accepted · {counts.filled} awaiting confirmation ·{" "}
            {counts.open} open
          </p>
        </div>
        <Link
          href={`/admin/casting-responses/${productionId}`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Playbill corrections →
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full", PILL.open)} /> Open
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full", PILL.filled)} /> Filled — family
          hasn&apos;t confirmed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-3 rounded-full", PILL.accepted)} /> Accepted —
          playbill name confirmed
        </span>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-1 p-4">
          {rows.map(({ role, status, holders }) => (
            <div
              key={role.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
            >
              <span
                className={cn(
                  "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold",
                  PILL[status]
                )}
              >
                {role.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {tierLabel.get(role.tier)}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                {holders.length === 0 ? (
                  <span className="text-muted-foreground">— uncast</span>
                ) : (
                  holders.map((holder, index) => (
                    <span key={index}>
                      {index > 0 && ", "}
                      <span className={holder.responded ? "font-medium" : undefined}>
                        {holder.playbillName}
                      </span>
                      {holder.isUnderstudy && (
                        <span className="text-xs text-muted-foreground"> (u/s)</span>
                      )}
                      {!holder.responded && !holder.isUnderstudy && (
                        <span className="text-xs text-muted-foreground"> · awaiting</span>
                      )}
                    </span>
                  ))
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Names shown are what the playbill will print — corrections families
        submit update here automatically.
      </p>

      {scenes.length > 0 && (
        <>
          <div>
            <h2 className="text-lg font-semibold">Script &amp; music breakdown</h2>
            <p className="text-sm text-muted-foreground">
              Which roles are called for each scene and number. Parents see
              their own child&apos;s version of this on the casting page, and
              scene-tagged rehearsals only reach the families who are called.
            </p>
          </div>
          <Card>
            <CardContent className="flex flex-col gap-1 p-4">
              {scenes.map((scene) => (
                <div key={scene.id} className="border-b py-2 last:border-b-0">
                  <p className="text-sm font-medium">
                    <span aria-hidden className="mr-1.5">
                      {scene.kind === "song" ? "🎵" : "🎭"}
                    </span>
                    {scene.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {scene.roleIds
                      .map((roleId) => roleNameById.get(roleId))
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
