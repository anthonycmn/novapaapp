import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { canAccessShow, getShowTeam } from "@/lib/staff-shows";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLinkButton } from "@/components/external-link-button";
import { CurriculumForm } from "./curriculum-form";

export const metadata = { title: "Show dashboard" };

/**
 * The per-show staff dashboard: CASTING FEATURES, ROSTER & CURRICULUM.
 * Staff open their own shows; admins and super admins open any.
 */
export default async function ShowDashboardPage({
  params,
}: {
  params: Promise<{ productionId: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");
  if ((process.env.NEXT_PUBLIC_DATA_MODE ?? "mock") !== "supabase") redirect("/admin");

  const { productionId } = await params;
  if (!(await canAccessShow(user, productionId))) redirect("/staff/shows");

  const provider = getProvider();
  const production = await provider.getProduction(productionId);
  if (!production) notFound();

  const [roster, board, team, responses] = await Promise.all([
    provider.getAuditionRoster(user.id, productionId),
    provider.getCastingBoard(user.id, productionId),
    getShowTeam(productionId),
    provider.getCastingResponses(user.id, productionId),
  ]);

  const scored = roster.filter((entry) => entry.evaluations.length >= 3).length;
  const responded = responses.filter((r) => r.confirmation.respondedAt).length;
  const boardStatus = board.board.status === "submitted" ? "Casting submitted" : "Draft board";
  const canEditCurriculum = hasRoleAtLeast(user, "admin");

  const castingLinks = [
    { href: `/admin/auditions/${productionId}`, title: "🎬 Audition roster", description: `${roster.length} registered · ${scored} fully scored` },
    { href: `/admin/casting/${productionId}`, title: "🎭 Casting board", description: boardStatus },
    { href: `/admin/casting-responses/${productionId}`, title: "💬 Family responses", description: `${responded}/${responses.length} confirmed` },
    { href: `/admin/cast-list/${productionId}`, title: "📋 Cast list", description: "Filled and accepted roles" },
    { href: `/admin/casting-review/${productionId}`, title: "📖 Pre-casting review", description: "Hopes and audition materials" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{production.title}</h1>
          <p className="text-muted-foreground">
            {roster.length} students enrolled · {boardStatus}
          </p>
        </div>
        <Link
          href="/staff/shows"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          ← My shows
        </Link>
      </div>

      <section aria-labelledby="casting-heading">
        <h2 id="casting-heading" className="mb-2 text-lg font-semibold">
          Casting
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {castingLinks.map((tile) => (
            <Link key={tile.href} href={tile.href}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{tile.title}</CardTitle>
                  <CardDescription>{tile.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="curriculum-heading">
        <h2 id="curriculum-heading" className="mb-2 text-lg font-semibold">
          Curriculum
        </h2>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Curriculum &amp; materials</CardTitle>
            <CardDescription>
              {production.curriculumUrl
                ? "Published — visible only to the staff on this show (and admins). Families never see it."
                : "Nothing published yet. When it's uploaded, only this show's staff and admins can open it."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 pt-0">
            {production.curriculumUrl && (
              <ExternalLinkButton href={`/api/curriculum/${productionId}`}>
                <BookOpen aria-hidden className="size-4" />
                View current curriculum
              </ExternalLinkButton>
            )}
            {canEditCurriculum && (
              <CurriculumForm
                productionId={productionId}
                hasExisting={Boolean(production.curriculumUrl)}
              />
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="roster-heading">
        <h2 id="roster-heading" className="mb-2 text-lg font-semibold">
          Roster
        </h2>
        <Card>
          <CardContent className="p-4">
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">No students enrolled yet.</p>
            ) : (
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {roster.map(({ student, profile }) => (
                  <li key={student.id} className="flex min-h-9 items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {student.preferredName ?? student.firstName} {student.lastName}
                      {student.grade ? (
                        <span className="text-muted-foreground"> · Gr {student.grade}</span>
                      ) : null}
                    </span>
                    {profile ? (
                      <Badge variant="gold">audition info ✓</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">no audition info</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {team.length > 0 && (
        <section aria-labelledby="team-heading">
          <h2 id="team-heading" className="mb-2 text-lg font-semibold">
            Production team
          </h2>
          <Card>
            <CardContent className="p-4">
              <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {team.map((member) => (
                  <li key={`${member.staffId}-${member.role}`} className="flex min-h-9 items-center justify-between gap-2 text-sm">
                    <span className="truncate">{member.name}</span>
                    <span className="text-xs text-muted-foreground">{member.role}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
