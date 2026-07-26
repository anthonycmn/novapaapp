import { notFound, redirect } from "next/navigation";
import { getProvider } from "@/lib/api";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Pre-casting review" };

/**
 * Director's pre-casting review (#4): every enrolled student with their
 * parent + student hopes, audition materials, and show history at a glance.
 * Staff/admin only — enforced here AND in the data layer.
 */
export default async function CastingReviewPage({
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

  const review = await provider.getCastingReview(user.id, productionId);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Pre-casting review</h1>
        <p className="text-muted-foreground">
          {production.title} · {review.length} student
          {review.length === 1 ? "" : "s"} enrolled
        </p>
      </div>

      {review.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No students enrolled yet.
          </CardContent>
        </Card>
      ) : (
        review.map(({ student, hopes }) => {
          const displayName = student.preferredName ?? student.firstName;
          const parentHopes = hopes
            .filter((entry) => entry.author === "parent")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const studentHopes = hopes
            .filter((entry) => entry.author === "student")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

          return (
            <Card key={student.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={`${student.firstName} ${student.lastName}`}
                    src={student.headshotUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      {displayName} {student.lastName}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Grade {student.grade}
                      {student.vocalRange ? ` · ${student.vocalRange}` : ""}
                    </p>
                  </div>
                  {student.auditionSongUrl && (
                    <a
                      href={student.auditionSongUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Audition song
                    </a>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 pt-2">
                {parentHopes[0] && (
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="secondary">Parent hopes</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(parentHopes[0].createdAt)}
                        {parentHopes.length > 1 && ` · ${parentHopes.length} versions`}
                      </span>
                    </div>
                    <p className="text-sm">{parentHopes[0].text}</p>
                  </div>
                )}
                {studentHopes[0] && (
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant="gold">{displayName}&apos;s hopes</Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(studentHopes[0].createdAt)}
                      </span>
                    </div>
                    <p className="text-sm">{studentHopes[0].text}</p>
                  </div>
                )}
                {parentHopes.length === 0 && studentHopes.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No hopes shared yet.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
