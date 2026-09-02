"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Quote, Video } from "lucide-react";
import type { Coach } from "@/lib/api/coaching/assemble";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * The portal's list, mirrored (staff portal `src/lib/coachingDiary.ts`). Two
 * copies because the two apps share no code, and the `?? d` fallback below is
 * what keeps the mirror survivable: a discipline added there and not here
 * renders as its own raw value — readable, because those values are written to
 * be read aloud — rather than dropping off a coach's card.
 */
const DISCIPLINE_LABEL: Record<string, string> = {
  voice: "Voice",
  acting: "Acting",
  dance: "Dance",
  "musical theatre": "Musical theatre",
  audition: "Audition prep",
};

/**
 * One coach, opening in place.
 *
 * Deliberately the same shape as StaffBioCard: a parent who has already met
 * the staff directory should not have to learn a second way of reading about
 * a person here. Closed, it is the face, the name and whether they are taking
 * students — enough to skim five coaches. Open, it is the paragraph.
 *
 * A <button> with aria-expanded rather than a clickable div, so it is
 * reachable by keyboard and announced as what it is.
 */
export function CoachCard({ coach }: { coach: Coach }) {
  const [open, setOpen] = useState(false);
  const { profile } = coach;

  const specialties = profile.specialties.length
    ? profile.specialties
    : coach.disciplines.map((d) => DISCIPLINE_LABEL[d] ?? d);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="gold-hover flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        <Avatar name={coach.name} src={profile.photoUrl} className="size-12" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{coach.name}</span>
            {coach.acceptingNew ? (
              <Badge variant="gold">Taking students</Badge>
            ) : (
              <Badge variant="secondary">Full just now</Badge>
            )}
          </span>
          {coach.headline && (
            <span className="mt-0.5 block truncate text-sm text-muted-foreground">
              {coach.headline}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t px-4 pb-4 pt-3">
          {specialties.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {specialties.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
          )}

          {profile.bio && (
            <p className="whitespace-pre-line text-sm leading-relaxed">
              {profile.bio}
            </p>
          )}

          {profile.familyMessage && (
            <p className="flex gap-2 rounded-md bg-secondary/50 p-3 text-sm italic">
              <Quote className="size-4 shrink-0 text-muted-foreground" />
              <span className="whitespace-pre-line">{profile.familyMessage}</span>
            </p>
          )}

          {profile.credits && (
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Credits: </span>
              {profile.credits}
            </p>
          )}

          {coach.videoUrl && (
            <a
              href={coach.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
            >
              <Video className="size-4" />
              Watch their introduction
            </a>
          )}

          <Link
            href={`/coaches/${coach.slug}`}
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium underline underline-offset-4"
          >
            {coach.acceptingNew
              ? `Book a session with ${coach.name}`
              : `See ${coach.name}'s times`}
            <ChevronRight className="size-4" />
          </Link>
        </div>
      )}
    </div>
  );
}
