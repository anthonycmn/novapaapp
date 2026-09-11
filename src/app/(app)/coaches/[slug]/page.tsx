import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Quote, Video } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getCoachBySlug } from "@/lib/api/coaching/coaches";
import {
  getCoachScheduleLines,
  getCoachingSummary,
  getSlotGrid,
} from "@/lib/api/coaching/booking";
import { getCoachingShop } from "@/lib/api/coaching/shop";
import { getPaymentProvider } from "@/lib/api/payments";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BookingForm } from "@/components/coaching/booking-form";
import { BuySessions } from "@/components/coaching/buy-sessions";

export const metadata = { title: "Coaching" };

/**
 * One coach: who they are, buying lessons with them, and keeping the slot.
 *
 * The bio and the booking sit on the same page on purpose. A parent deciding
 * who coaches their child is answering "is this the right person" and "can
 * they do Thursday" at the same time, and splitting those across two screens
 * makes them answer the first one twice.
 *
 * The whole journey lives here now — Tony, 11 Sep 2026: choose the child,
 * choose the coach, choose the kind of lesson, choose the quantity, pay, and
 * come straight back to schedule. Stripe's success URL returns to THIS page
 * with ?bought=, so the parent lands on the punch card they just filled.
 */
export default async function CoachPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    bought?: string;
    type?: string;
    error?: string;
    student?: string;
  }>;
}) {
  const { slug } = await params;
  const { bought, type, error, student } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const profiles = await provider.getStaffProfiles();
  const coach = await getCoachBySlug(slug, profiles);
  if (!coach) notFound();

  const [summary, slots, students, offers, scheduleLines] = await Promise.all([
    user.familyId ? getCoachingSummary(user.familyId) : Promise.resolve(null),
    getSlotGrid(coach),
    user.familyId
      ? provider.getStudentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
    user.familyId ? getCoachingShop() : Promise.resolve([]),
    getCoachScheduleLines([coach.staffId]),
  ]);

  // The child chosen on the coaches page rides along in the URL; anything
  // that is not one of this family's own students is simply ignored.
  const initialStudentId = students.some((s) => s.id === student)
    ? student
    : undefined;
  const schedule = scheduleLines[coach.staffId] ?? [];

  const purchased = (summary?.packages ?? []).reduce(
    (total, pkg) => total + (Number(pkg.purchased) || 0),
    0
  );
  const sessionsLeft = summary?.sessionsLeft ?? 0;
  const scheduled = summary?.upcoming.length ?? 0;
  const punch =
    purchased > 0
      ? {
          purchased,
          completed: Math.max(0, purchased - sessionsLeft - scheduled),
          scheduled,
          remaining: sessionsLeft,
        }
      : null;

  const { profile } = coach;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/coaches"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" />
        All coaches
      </Link>

      <div className="flex items-start gap-4">
        <Avatar name={coach.name} src={profile.photoUrl} className="size-16" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{coach.name}</h1>
          {coach.headline && (
            <p className="text-muted-foreground">{coach.headline}</p>
          )}
          {!coach.acceptingNew && (
            <Badge variant="secondary" className="mt-1">
              Not taking new students
            </Badge>
          )}
        </div>
      </div>

      {/* The schedule stays in sight on the coach's own page too — the same
          lines the chooser card showed, so nothing changes underfoot. */}
      {schedule.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Schedule:</span>
          {schedule.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      )}

      {profile.specialties.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.specialties.map((item) => (
            <Badge key={item} variant="outline">
              {item}
            </Badge>
          ))}
        </div>
      )}

      {profile.bio && (
        <p className="whitespace-pre-line leading-relaxed">{profile.bio}</p>
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

      <h2 className="mt-2 text-lg font-semibold">Book lessons</h2>
      {!user.familyId ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          Coaching is booked from a family account.
        </p>
      ) : !coach.acceptingNew ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          {coach.name} is not taking new students at the moment. Message the
          office and we will suggest another coach.
        </p>
      ) : (
        <>
          {bought && sessionsLeft === 0 && (
            <p className="rounded-lg border bg-card p-4 text-sm">
              Payment received — your lessons are on their way onto your punch
              card. This usually takes a few seconds; refresh if they have not
              appeared.
            </p>
          )}
          {bought && sessionsLeft > 0 && (
            <p className="rounded-lg border bg-card p-4 text-sm font-medium">
              Payment received. Now pick the weekly time your lessons will
              keep — same day, same time, week after week.
            </p>
          )}

          {sessionsLeft === 0 && (
            <BuySessions
              offers={offers}
              students={students.map((s) => ({
                id: s.id,
                name: s.preferredName || s.firstName,
              }))}
              initialStudentId={initialStudentId}
              error={error}
              paymentsConfigured={getPaymentProvider().isConfigured()}
              lessonTypes={coach.disciplines}
              returnTo={`/coaches/${slug}`}
            />
          )}

          <BookingForm
            coachStaffId={coach.staffId}
            coachName={coach.name}
            sessionMinutes={coach.sessionMinutes}
            students={students.map((s) => ({
              id: s.id,
              name: s.preferredName || s.firstName,
            }))}
            initialStudentId={initialStudentId}
            slots={slots}
            sessionsLeft={sessionsLeft}
            lessonTypes={coach.disciplines}
            initialType={type}
            punch={punch}
          />
        </>
      )}
    </div>
  );
}
