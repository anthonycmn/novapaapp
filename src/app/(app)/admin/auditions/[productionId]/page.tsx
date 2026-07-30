import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { DISCIPLINES, ROLE_TIERS } from "@/lib/api/auditions/types";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RubricForm } from "./rubric-form";

export const metadata = { title: "Audition roster" };

/**
 * Teacher portal for audition day (#auditions): every registered student —
 * no one forgotten — with their family's submission, materials, and the
 * three-discipline rubric.
 */
export default async function AuditionRosterPage({
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

  const roster = await provider.getAuditionRoster(user.id, productionId);
  const tierLabel = new Map(ROLE_TIERS.map((tier) => [tier.value, tier.label]));

  const scored = roster.filter((row) => row.evaluations.length === DISCIPLINES.length).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Auditions — {production.title}</h1>
          <p className="text-muted-foreground">
            {roster.length} registered · {scored} fully scored
          </p>
        </div>
        <Link
          href={`/admin/casting/${productionId}`}
          className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Casting board →
        </Link>
      </div>

      {roster.map(({ student, profile, evaluations }) => {
        const displayName = student.preferredName ?? student.firstName;
        return (
          <Card key={student.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <Avatar
                  name={`${student.firstName} ${student.lastName}`}
                  src={student.headshotUrl}
                />
                <div className="min-w-0 flex-1">
                  <CardTitle as="h2" className="text-base">
                    {displayName} {student.lastName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Grade {student.grade}
                    {student.vocalRange && ` · ${student.vocalRange}`}
                  </p>
                </div>
                {profile ? (
                  <Badge variant="gold">
                    Hoping: {tierLabel.get(profile.preferenceTier)}
                  </Badge>
                ) : (
                  <Badge variant="outline">No audition info submitted</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 pt-2">
              {profile && (
                <div className="rounded-lg bg-muted p-3 text-sm">
                  {profile.previousRoles && (
                    <p>
                      <span className="font-medium">Previous roles: </span>
                      {profile.previousRoles}
                    </p>
                  )}
                  {profile.hopes && (
                    <p className={profile.previousRoles ? "mt-1" : ""}>
                      <span className="font-medium">Hoping for: </span>
                      {profile.hopes}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-3 text-sm">
                {student.auditionSongUrl && (
                  <a
                    href={student.auditionSongUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    🎵 Audition song
                  </a>
                )}
                <Link
                  href={`/family/students/${student.id}/resume`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  📄 Resume
                </Link>
              </div>

              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Rubric ({evaluations.length}/{DISCIPLINES.length} disciplines scored)
                </summary>
                <div className="mt-3">
                  <RubricForm
                    studentId={student.id}
                    productionId={productionId}
                    evaluations={evaluations}
                  />
                </div>
              </details>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
