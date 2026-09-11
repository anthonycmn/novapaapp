"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, GraduationCap } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export interface ChoosableCoach {
  slug: string;
  staffId: string;
  name: string;
  headline: string | null;
  photoUrl: string | null;
  acceptingNew: boolean;
  /** The kinds of lesson this coach offers, e.g. acting / vocal / mt acting. */
  disciplines: string[];
  /** "Fridays 5:00 PM–10:00 PM", one line per weekly window. */
  scheduleLines: string[];
}

const label = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

/**
 * The booking journey in the order Tony stated it, 11 Sep 2026: "they choose
 * their child, they choose the coach with their schedule listed, they choose
 * the type of lesson the coach offers … they choose the quantity, and then
 * they check out, and then they are prompted to schedule their lessons."
 *
 * Steps one and two live here. The child is asked FIRST — one child answers
 * itself silently — and every coach card carries the coach's weekly schedule
 * and lesson kinds, because "can they do Sundays" is part of choosing a
 * coach, not a surprise saved for after. Choosing carries the child onto the
 * coach's page, where the lesson kind, the quantity, the checkout and the
 * scheduling prompt continue in that order.
 */
export function CoachChooser({
  students,
  coaches,
}: {
  students: { id: string; name: string }[];
  coaches: ChoosableCoach[];
}) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");

  if (students.length === 0 || coaches.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {students.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">1 · Who is this for?</p>
          <div className="flex flex-wrap gap-1.5">
            {students.map((student) => {
              const selected = student.id === studentId;
              return (
                <button
                  key={student.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setStudentId(student.id)}
                  className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                    selected
                      ? "border-transparent bg-primary font-medium text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  {student.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          {students.length > 1 ? "2 · Choose a coach" : "Choose a coach"}
        </p>
        {coaches.map((coach) => (
          <Card key={coach.staffId}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <Avatar name={coach.name} src={coach.photoUrl ?? undefined} className="size-12" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {coach.name}
                    {coach.acceptingNew ? (
                      <Badge variant="secondary">Taking students</Badge>
                    ) : (
                      <Badge variant="outline">Not taking new students</Badge>
                    )}
                  </p>
                  {coach.headline && (
                    <p className="text-sm text-muted-foreground">{coach.headline}</p>
                  )}
                </div>
              </div>

              {coach.disciplines.length > 0 && (
                <p className="flex flex-wrap items-center gap-1.5 text-sm">
                  <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
                  {coach.disciplines.map((type) => (
                    <Badge key={type} variant="outline">
                      {label(type)}
                    </Badge>
                  ))}
                </p>
              )}

              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <CalendarDays className="size-4 shrink-0" />
                {coach.scheduleLines.length > 0 ? (
                  coach.scheduleLines.map((line) => <span key={line}>{line}</span>)
                ) : (
                  <span>Hours coming soon — message the office for a time.</span>
                )}
              </p>

              {coach.acceptingNew && (
                <Link
                  href={`/coaches/${coach.slug}?student=${encodeURIComponent(studentId)}`}
                  className={`${buttonVariants({ size: "sm" })} self-start`}
                >
                  Choose {coach.name.split(" ")[0]}
                  <ChevronRight className="size-4" />
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
