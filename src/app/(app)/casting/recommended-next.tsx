import {
  RECOMMENDED_LESSONS,
  type AuditionEvaluation,
  type RecommendedClass,
  type RecommendedLesson,
} from "@/lib/api/auditions/types";
import { WEEKDAY_NAMES } from "@/lib/api/lessons/types";
import { registration } from "@/config/registration";

/**
 * "Classes we recommend to help you improve" — the ticks the panel made on
 * their rubrics (hub 0085), read as one list.
 *
 * CJ, 14 Sep 2026: "parents also see what classes they can sign up for …
 * include the day of the week and the time that class meets, so when parents
 * receive it they can see if it fits into their schedule."
 *
 * One list, not one per rubric: the Director and the Choreographer ticking
 * the same Tuesday class is one recommendation a family should act on, not
 * two cards saying the same thing. Who recommended it rides in the
 * tooltip. Each class shows the weekday and the time it meets — as it was
 * when the rubric was saved — and a Register button when the class is on
 * sale at registration.
 *
 * Lessons are a kind, not a listing (no voice, musical theatre or dance
 * lesson is a catalogue row a family can buy today), so the four lines share
 * one door: the coaching page, where the office arranges the rest.
 */
export function RecommendedNext({
  evaluations,
  studentFirstName,
}: {
  evaluations: AuditionEvaluation[];
  studentFirstName: string;
}) {
  const classes = mergeClasses(evaluations);
  const lessons = mergeLessons(evaluations);
  if (classes.length === 0 && lessons.length === 0) return null;

  return (
    <div className="rounded-lg border border-gold/50 bg-gold/5 p-4">
      <h4 className="font-semibold">Classes we recommend to help {studentFirstName} improve</h4>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Picked by the creative team from what they saw at the audition. Days and times are
        when each class meets, so you can see what fits your week.
      </p>

      {classes.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {classes.map(({ cls, by }) => (
            <li
              key={cls.classId || `${cls.name}-${cls.dayOfWeek}-${cls.startsAt}`}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border bg-background px-3 py-2"
              title={by.length ? `Recommended by ${by.join(", ")}` : undefined}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {cls.name}
                  {cls.ages && (
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ages {cls.ages}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{meets(cls)}</p>
              </div>
              {cls.activityId ? (
                <a
                  href={registration.activityUrl(cls.activityId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Register
                </a>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Ask the office about this one
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {lessons.length > 0 && (
        <div className="mt-3">
          <p className="text-sm font-medium">Private lessons</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {lessons.map(({ lesson, by }) => (
              <li
                key={lesson}
                className="rounded-md border bg-background px-2 py-1 text-[13px]"
                title={by.length ? `Recommended by ${by.join(", ")}` : undefined}
              >
                {RECOMMENDED_LESSONS.find((l) => l.value === lesson)?.label ?? lesson}
              </li>
            ))}
          </ul>
          <a
            href={registration.coachingUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex h-9 items-center rounded-lg border bg-background px-3 text-sm font-semibold hover:bg-muted"
          >
            Ask about private lessons
          </a>
        </div>
      )}
    </div>
  );
}

/** "Mondays, 6:00–6:55 pm" */
export function meets(cls: RecommendedClass): string {
  const day = WEEKDAY_NAMES[cls.dayOfWeek] ?? "";
  const start = clock(cls.startsAt);
  const end = clock(cls.endsAt);
  const when = start && end ? `${start}–${end}` : start || end;
  return day ? `${day}s${when ? `, ${when}` : ""}` : when;
}

/** "18:00:00" → "6:00 pm"; the am/pm is dropped when a range shares it. */
function clock(t: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? "");
  if (!m) return "";
  const h24 = Number(m[1]);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${h24 < 12 ? "am" : "pm"}`;
}

function mergeClasses(
  evaluations: AuditionEvaluation[]
): Array<{ cls: RecommendedClass; by: string[] }> {
  const byKey = new Map<string, { cls: RecommendedClass; by: string[] }>();
  for (const e of evaluations) {
    for (const cls of e.recommendedClasses ?? []) {
      const key = cls.classId || `${cls.name}|${cls.dayOfWeek}|${cls.startsAt}`;
      const hit = byKey.get(key);
      if (hit) {
        if (e.evaluatorName && !hit.by.includes(e.evaluatorName)) hit.by.push(e.evaluatorName);
      } else {
        byKey.set(key, { cls, by: e.evaluatorName ? [e.evaluatorName] : [] });
      }
    }
  }
  return [...byKey.values()].sort(
    (a, b) =>
      a.cls.dayOfWeek - b.cls.dayOfWeek || a.cls.startsAt.localeCompare(b.cls.startsAt)
  );
}

function mergeLessons(
  evaluations: AuditionEvaluation[]
): Array<{ lesson: RecommendedLesson; by: string[] }> {
  const by = new Map<RecommendedLesson, string[]>();
  for (const e of evaluations) {
    for (const lesson of e.recommendedLessons ?? []) {
      const names = by.get(lesson) ?? [];
      if (e.evaluatorName && !names.includes(e.evaluatorName)) names.push(e.evaluatorName);
      by.set(lesson, names);
    }
  }
  // CJ's order, not the order the panel happened to save in.
  return RECOMMENDED_LESSONS.filter((l) => by.has(l.value)).map((l) => ({
    lesson: l.value,
    by: by.get(l.value) ?? [],
  }));
}
