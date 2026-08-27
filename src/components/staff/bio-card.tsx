"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Quote } from "lucide-react";
import type { StaffAssignment } from "@/lib/api/types";
import { describeRoles } from "@/lib/api/staff/for-family";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * One colleague, opening in place.
 *
 * Tony, 17 Aug 2026: "they should be able to click in and then click the
 * headshot and name and the title pops out, and it's their bio and the little
 * message to the family."
 *
 * So the closed card is the headshot and the name — the two things that let a
 * parent recognize somebody at pickup — and the title, bio and message unfold
 * underneath when you press it. Unfolding in place rather than navigating
 * matters here: a parent reading about four people compares them, and a page
 * per person turns a comparison into four round trips.
 *
 * It is a <button> with aria-expanded rather than a div with a click handler,
 * so it is reachable by keyboard and announced as what it is. The separate
 * full profile page still exists and is linked at the bottom.
 */
export function StaffBioCard({ assignment }: { assignment: StaffAssignment }) {
  const [open, setOpen] = useState(false);
  const { profile } = assignment;
  const summary = describeRoles(assignment);

  /*
   * Whose child meets this person, across every role they hold. Deduplicated:
   * Ryyana holding three jobs on one show should not tell you "Ava, Ava, Ava".
   */
  const children = [
    ...new Set(assignment.roles.flatMap((role) => role.studentNames)),
  ].sort((a, b) => a.localeCompare(b));

  /*
   * A profile only reaches families once an administrator has released it.
   * The NAME and the role are not gated — a family meets this person in the
   * room every week — but the bio, photo and message are theirs to approve.
   */
  const released = profile.isPublished;
  const hasDetail =
    released && Boolean(profile.bio || profile.familyMessage || profile.credits);

  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="gold-hover flex w-full items-center gap-3 p-4 text-left transition-colors"
      >
        <Avatar
          name={profile.fullName}
          src={released ? profile.photoUrl : undefined}
          className="size-14 shrink-0"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-semibold">{profile.fullName}</span>
          <span className="block text-[12.5px] text-muted-foreground">{summary}</span>
          {children.length > 0 && (
            <span className="mt-0.5 block text-[12px] text-muted-foreground">
              {children.length === 1
                ? `Works with ${children[0]}`
                : `Works with ${children.slice(0, -1).join(", ")} and ${children.at(-1)}`}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          size={18}
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="border-t px-4 py-3">
          {profile.title && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              {profile.title}
            </p>
          )}

          {/* The message comes FIRST when there is one. It is written to this
              parent; the bio is written about the person. */}
          {released && profile.familyMessage && (
            <blockquote className="gold-band mt-2 flex gap-2 rounded-md border p-3">
              <Quote aria-hidden size={14} className="mt-0.5 shrink-0 opacity-70" />
              <p className="whitespace-pre-line text-[13px] leading-relaxed">
                {profile.familyMessage}
              </p>
            </blockquote>
          )}

          {released && profile.bio && (
            <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed">
              {profile.bio}
            </p>
          )}

          {released && profile.credits && (
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
              {profile.credits}
            </p>
          )}

          {released && profile.specialties.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {profile.specialties.map((specialty) => (
                <Badge key={specialty} variant="secondary">
                  {specialty}
                </Badge>
              ))}
            </p>
          )}

          {/* Say the gap rather than showing an empty card. A parent who
              opens this and finds nothing should know it is unwritten, not
              that they broke something. */}
          {!hasDetail && (
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {profile.fullName.split(" ")[0]} hasn&apos;t written a bio yet.
              You&apos;ll still meet them at every{" "}
              {assignment.roles[0]?.role ? "rehearsal" : "class"}, and you can
              always{" "}
              <Link href="/messages/new" className="text-primary underline-offset-4 hover:underline">
                message the office
              </Link>{" "}
              with a question.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            {released && (
              <Link
                href={`/staff/${profile.id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Full profile
              </Link>
            )}
            {/* Where you actually meet them — a parent reading this is often
                one tap from wanting the show or class page. */}
            {[...new Map(assignment.roles.map((r) => [r.href, r])).values()].map(
              (role) => (
                <Link
                  key={role.href}
                  href={role.href}
                  className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {role.offering}
                </Link>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
