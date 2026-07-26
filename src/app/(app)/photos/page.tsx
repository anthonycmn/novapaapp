import Link from "next/link";
import { redirect } from "next/navigation";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { org } from "@/config/org";
import { getProvider } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExternalLinkButton } from "@/components/external-link-button";
import { MatchCard } from "./match-card";

export const metadata = { title: "Photos" };

/**
 * Photos tab (#6): matched photos of this family's children first, then all
 * galleries. Renders from stored matches only — matching itself runs in a
 * background job, so this page never waits on face processing.
 */
export default async function PhotosPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const galleries = await provider.getGalleries(user.id);

  if (!user.familyId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Photos</h1>
        <GalleryList galleries={galleries} />
      </div>
    );
  }

  const [students, matches] = await Promise.all([
    provider.getStudentsForFamily(user.id, user.familyId),
    provider.getMatchesForFamily(user.id, user.familyId),
  ]);

  const optedIn = students.filter((student) => student.consents.faceMatching);
  const notOptedIn = students.filter((student) => !student.consents.faceMatching);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Photos</h1>

      {matches.length > 0 && (
        <section aria-labelledby="matches-heading">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles aria-hidden className="size-5 text-gold" />
            <h2 id="matches-heading" className="text-lg font-semibold">
              Photos of your {matches.length === 1 ? "child" : "children"}
            </h2>
            <Badge variant="gold">{matches.length}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {matches.map(({ match, photo, studentName }) => (
              <MatchCard
                key={match.id}
                match={match}
                photo={photo}
                studentName={studentName}
              />
            ))}
          </div>
        </section>
      )}

      {optedIn.length > 0 && matches.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Photo matching is on for{" "}
            {optedIn.map((s) => s.preferredName ?? s.firstName).join(" and ")}. We
            haven&apos;t found any photos yet — we&apos;ll let you know as soon
            as we do.
          </CardContent>
        </Card>
      )}

      {notOptedIn.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Find photos automatically</CardTitle>
            <CardDescription>
              Optional. We&apos;ll pull out the photos with your child in them
              so you don&apos;t have to scroll through hundreds.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 pt-0">
            {notOptedIn.map((student) => (
              <Link
                key={student.id}
                href={`/photos/consent/${student.id}`}
                className="inline-flex h-11 items-center justify-between rounded-lg border px-4 text-sm font-medium hover:bg-accent"
              >
                Set up for {student.preferredName ?? student.firstName}
                <span aria-hidden>→</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {optedIn.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {optedIn.map((student) => (
            <Link
              key={student.id}
              href={`/photos/consent/${student.id}`}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Manage matching for {student.preferredName ?? student.firstName}
            </Link>
          ))}
        </div>
      )}

      <GalleryList galleries={galleries} />
    </div>
  );
}

function GalleryList({
  galleries,
}: {
  galleries: Awaited<ReturnType<ReturnType<typeof getProvider>["getGalleries"]>>;
}) {
  return (
    <section aria-labelledby="galleries-heading">
      <h2 id="galleries-heading" className="mb-2 text-lg font-semibold">
        All galleries
      </h2>
      {galleries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <ImageIcon aria-hidden className="size-8 text-muted-foreground" />
            <p className="font-medium">No galleries yet</p>
            <p className="text-sm text-muted-foreground">
              Show and rehearsal photos will appear here after each production.
            </p>
            <ExternalLinkButton href={org.smugmugUrl} variant="subtle">
              Browse past galleries on SmugMug
            </ExternalLinkButton>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {galleries.map((gallery) => (
            <Card key={gallery.id}>
              <CardContent className="flex items-center justify-between gap-2 p-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{gallery.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {gallery.photoCount} photos · {formatDate(gallery.createdAt)}
                  </p>
                </div>
                <ExternalLinkButton href={gallery.url} variant="outline">
                  Open
                </ExternalLinkButton>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
