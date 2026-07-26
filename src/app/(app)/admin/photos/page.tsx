import { redirect } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getFaceMatchProvider } from "@/lib/api/photos/face-provider";
import { getSmugMugProvider } from "@/lib/api/photos/smugmug";
import { getSessionUser, hasRoleAtLeast } from "@/lib/auth/session";
import { runIngestAction } from "@/lib/actions/photos";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Photo ingestion" };

/** Admin view for gallery ingestion and matching (#6). */
export default async function PhotosAdminPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!hasRoleAtLeast(user, "staff")) redirect("/dashboard");

  const provider = getProvider();
  const galleries = await provider.getGalleries(user.id);
  const faceProvider = getFaceMatchProvider();
  const smugmug = getSmugMugProvider();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Photo ingestion</h1>
        <form action={runIngestAction}>
          <Button type="submit">
            <RefreshCw aria-hidden />
            Ingest & match
          </Button>
        </form>
      </div>

      {(!faceProvider.isConfigured() || !smugmug.isConfigured()) && (
        <Card className="border-gold/50 bg-accent">
          <CardContent className="p-4 text-sm text-accent-foreground">
            <p className="font-medium">Running on mock providers</p>
            <p>
              {!smugmug.isConfigured() && "SmugMug credentials not set. "}
              {!faceProvider.isConfigured() &&
                "Face embedding service not set — matching uses deterministic stand-in vectors. "}
              See NEEDS-FROM-TONY.md #4 and #5.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Providers</CardTitle>
          <CardDescription>
            Matching runs as a background job — it never blocks a page load
            for a family.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 pt-0 text-sm">
          <p>
            <span className="text-muted-foreground">Galleries: </span>
            {smugmug.displayName}
          </p>
          <p>
            <span className="text-muted-foreground">Face embeddings: </span>
            {faceProvider.displayName} · {faceProvider.dimensions}-d
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="galleries-heading">
        <h2 id="galleries-heading" className="mb-2 text-lg font-semibold">
          Ingested galleries
        </h2>
        {galleries.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Nothing ingested yet. Hit &ldquo;Ingest &amp; match&rdquo; to pull
              galleries from SmugMug.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {galleries.map((gallery) => (
              <Card key={gallery.id}>
                <CardContent className="p-4">
                  <p className="font-medium">{gallery.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {gallery.photoCount} photos
                    {gallery.ingestedAt && ` · ingested ${formatDate(gallery.ingestedAt)}`}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Privacy reminders</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-muted-foreground">
          <ul className="flex list-disc flex-col gap-1 pl-4">
            <li>Only students whose parents opted in are ever matched.</li>
            <li>
              Matches are visible to that family and to admins — staff at large
              do not browse them.
            </li>
            <li>
              Revoking consent deletes face signatures, reference photos, and
              matches immediately.
            </li>
            <li>Photos are never copied off SmugMug; we store links only.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
