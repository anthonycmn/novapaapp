import Link from "next/link";
import { Camera } from "lucide-react";
import { getProvider } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";

/**
 * Photos of your child, on the page — not a button that says "Photos".
 *
 * Tony, 16 Aug 2026: "I don't want all these buttons that I have to click to
 * go elsewhere - it needs to be way more user friendly." A tile linking to
 * the gallery makes a parent navigate to find out whether there is anything
 * worth navigating for. The thumbnails answer that before they click.
 *
 * Renders nothing at all when there are no matches. An empty card that says
 * "no photos yet" is another thing to read past.
 */
export async function ShowPhotos({
  userId,
  familyId,
}: {
  userId: string;
  familyId?: string;
}) {
  if (!familyId) return null;

  const matches = await getProvider().getMatchesForFamily(userId, familyId);
  if (matches.length === 0) return null;

  return (
    <Card pad={false}>
      <SectionHeader
        title={`${matches.length} photo${matches.length === 1 ? "" : "s"} of your ${
          matches.length === 1 ? "child" : "children"
        }`}
        inCard
        right={
          <Link
            href="/photos"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            All photos
          </Link>
        }
      />
      <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-5 lg:grid-cols-6">
        {matches.slice(0, 12).map(({ match, photo, studentName }) => (
          <a
            key={match.id}
            href={photo.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative overflow-hidden rounded-md border"
            title={`${studentName} — opens the full photo`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbnailUrl}
              alt={`Photo of ${studentName}`}
              className="aspect-square w-full bg-muted object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          </a>
        ))}
      </div>
      <p className="flex items-center gap-1.5 border-t px-4 py-2 text-[11.5px] text-muted-foreground">
        <Camera aria-hidden size={12} />
        Matched by the photo service. If one of these is not your child, tell us
        on the photo itself and we will not match it again.
      </p>
    </Card>
  );
}
