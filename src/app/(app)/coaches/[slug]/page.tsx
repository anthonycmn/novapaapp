import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Quote, Video } from "lucide-react";
import { getProvider } from "@/lib/api";
import { getCoachBySlug } from "@/lib/api/coaching/coaches";
import { getCoachingSummary, getOpenSlots } from "@/lib/api/coaching/booking";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BookingForm } from "@/components/coaching/booking-form";

export const metadata = { title: "Coaching" };

/**
 * One coach, and the hour you can book with them.
 *
 * The bio and the booking sit on the same page on purpose. A parent deciding
 * who coaches their child is answering "is this the right person" and "can
 * they do Thursday" at the same time, and splitting those across two screens
 * makes them answer the first one twice.
 */
export default async function CoachPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const provider = getProvider();
  const profiles = await provider.getStaffProfiles();
  const coach = await getCoachBySlug(slug, profiles);
  if (!coach) notFound();

  const [summary, slots, students] = await Promise.all([
    user.familyId ? getCoachingSummary(user.familyId) : Promise.resolve(null),
    getOpenSlots(coach),
    user.familyId
      ? provider.getStudentsForFamily(user.id, user.familyId)
      : Promise.resolve([]),
  ]);

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

      <h2 className="mt-2 text-lg font-semibold">Book a session</h2>
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
        <BookingForm
          coachStaffId={coach.staffId}
          coachName={coach.name}
          sessionMinutes={coach.sessionMinutes}
          students={students.map((student) => ({
            id: student.id,
            name: student.preferredName || student.firstName,
          }))}
          slots={slots}
          sessionsLeft={summary?.sessionsLeft ?? 0}
        />
      )}
    </div>
  );
}
