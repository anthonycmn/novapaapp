import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Casting responses" };

/** Playbill confirmations: who has responded, and every name correction. */
export default async function CastingResponsesPage({
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

  const responses = await provider.getCastingResponses(user.id, productionId);
  const corrections = responses.filter((row) => row.confirmation.playbillName);
  const awaiting = responses.filter((row) => row.confirmation.nameCorrect === undefined);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">
          Playbill confirmations — {production.title}
        </h1>
        <p className="text-muted-foreground">
          {responses.length - awaiting.length}/{responses.length} families responded
          {corrections.length > 0 &&
            ` · ${corrections.length} name correction${corrections.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {corrections.length > 0 && (
        <Card className="border-gold/50">
          <CardHeader className="pb-2">
            <CardTitle as="h2" className="text-base">
              Corrections for the playbill
            </CardTitle>
            <CardDescription>Use these exact spellings.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 pt-0 text-sm">
            {corrections.map((row) => (
              <p key={row.confirmation.id}>
                <span className="text-muted-foreground line-through">
                  {row.studentName}
                </span>{" "}
                → <span className="font-semibold">{row.confirmation.playbillName}</span>{" "}
                <span className="text-muted-foreground">({row.roleName})</span>
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {responses.map((row) => (
          <Card key={row.confirmation.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">
                  {row.confirmation.playbillName ?? row.studentName}
                </p>
                <p className="text-sm text-muted-foreground">{row.roleName}</p>
              </div>
              {row.confirmation.nameCorrect === undefined ? (
                <Badge variant="outline">Awaiting reply</Badge>
              ) : row.confirmation.playbillName ? (
                <Badge variant="gold">Name corrected</Badge>
              ) : (
                <Badge>Confirmed ✓</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
