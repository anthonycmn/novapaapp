"use client";

import { useTransition } from "react";
import { ExternalLink, ThumbsUp, X } from "lucide-react";
import { confirmMatchAction, rejectMatchAction } from "@/lib/actions/photos";
import type { GalleryPhoto, PhotoMatch } from "@/lib/api/photos/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * One matched photo. Deep-links to SmugMug so prints are still bought there
 * (#6), and carries the "not my child" correction.
 */
export function MatchCard({
  match,
  photo,
  studentName,
}: {
  match: PhotoMatch;
  photo: GalleryPhoto;
  studentName: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3">
        <a
          href={photo.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group relative block overflow-hidden rounded-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.thumbnailUrl}
            alt={`Photo matched to ${studentName}`}
            className="aspect-[3/2] w-full bg-muted object-cover"
            loading="lazy"
          />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white">
            View on SmugMug
            <ExternalLink aria-hidden className="size-3" />
          </span>
        </a>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm">
            <span className="font-medium">{studentName}</span>
            {match.state === "confirmed" && (
              <span className="ml-1.5 text-xs text-muted-foreground">confirmed</span>
            )}
          </p>
          <div className="flex gap-1">
            {match.state !== "confirmed" && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={`Confirm this is ${studentName}`}
                onClick={() =>
                  startTransition(() => confirmMatchAction(match.id).then(() => {}))
                }
              >
                <ThumbsUp aria-hidden />
                Yes
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(() => rejectMatchAction(match.id).then(() => {}))
              }
            >
              <X aria-hidden />
              Not {studentName}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
